import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { BILLING_REPOSITORY, BillingRepository } from './billing.repository';
import { BillingTier, SubscriptionStatus, UserSubscription } from './billing.types';
import { TIER_PRICE_ENV_MAP } from './billing.constants';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe?: Stripe;
  private readonly priceMap: Partial<Record<BillingTier, string>>;
  private readonly webhookSecret?: string;
  private readonly appWebUrl: string;

  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repository: BillingRepository,
    private readonly configService: ConfigService,
  ) {
    const secret = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || undefined;
    this.appWebUrl = this.configService.get<string>('APP_WEB_URL') || 'https://example.com';
    this.priceMap = this.loadPriceMap();
    if (secret) {
      this.stripe = new Stripe(secret, { apiVersion: '2024-04-10' });
    }
  }

  async createCheckoutSession(userId: string, tier: BillingTier): Promise<{ url: string | null }> {
    this.ensureStripe();
    if (tier === 'free') {
      throw new BadRequestException('Free tier does not require checkout');
    }
    const priceId = this.getPriceId(tier);
    if (!priceId) {
      throw new BadRequestException(`No Stripe price configured for tier ${tier}`);
    }

    const existing = await this.repository.getSubscription(userId);
    const customerId = existing?.stripeCustomerId ?? (await this.createCustomer(userId));

    const session = await this.stripe!.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.appWebUrl}/billing/success`,
      cancel_url: `${this.appWebUrl}/billing/canceled`,
      client_reference_id: userId,
      metadata: { user_id: userId, tier },
    });

    if (!existing) {
      await this.repository.upsertSubscription({
        userId,
        stripeCustomerId: customerId,
        tier: 'free',
        status: 'none',
      });
    }

    return { url: session.url };
  }

  async createPortalSession(userId: string): Promise<{ url: string | null }> {
    this.ensureStripe();
    const subscription = await this.repository.getSubscription(userId);
    const customerId = subscription?.stripeCustomerId;
    if (!customerId) {
      throw new BadRequestException('No Stripe customer found for this user');
    }

    const session = await this.stripe!.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${this.appWebUrl}/billing/portal-return`,
    });

    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    this.ensureStripe();
    if (!this.webhookSecret) {
      throw new BadRequestException('Stripe webhook secret is not configured');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe!.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      this.logger.error(`Failed to verify Stripe webhook: ${error instanceof Error ? error.message : error}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionEvent(subscription);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await this.handleInvoiceStatus(invoice, 'past_due');
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await this.handleInvoiceStatus(invoice, 'active');
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event type ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    if (!session.subscription) {
      this.logger.warn('Checkout session completed without subscription id');
      return;
    }
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
    const userId = (session.metadata?.user_id as string) || session.client_reference_id;
    const subscription = await this.stripe!.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });
    const resolvedUserId = userId || (subscription.metadata?.user_id as string);
    if (!resolvedUserId) {
      this.logger.warn(`Could not resolve user id for subscription ${subscription.id}`);
      return;
    }
    await this.syncSubscription(subscription, resolvedUserId);
  }

  private async handleSubscriptionEvent(subscription: Stripe.Subscription) {
    const userId =
      (subscription.metadata?.user_id as string) ||
      (await this.repository.findByCustomerId(subscription.customer as string))?.userId;

    if (!userId) {
      this.logger.warn(`Received subscription event for ${subscription.id} but could not resolve user`);
      return;
    }
    await this.syncSubscription(subscription, userId);
  }

  private async handleInvoiceStatus(invoice: Stripe.Invoice, status: SubscriptionStatus) {
    if (!invoice.subscription) return;
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
    const existing = await this.repository.findBySubscriptionId(subscriptionId);
    const userId = existing?.userId;
    if (!userId) {
      this.logger.warn(`Invoice event for ${subscriptionId} without mapped user`);
      return;
    }

    const subscription = await this.stripe!.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });
    await this.syncSubscription({ ...subscription, status } as Stripe.Subscription, userId);
  }

  private async syncSubscription(stripeSub: Stripe.Subscription, userId: string): Promise<UserSubscription | undefined> {
    const price = stripeSub.items?.data?.[0]?.price;
    const tier = price ? this.resolveTier(price) : undefined;
    if (!tier) {
      this.logger.warn(`Could not resolve tier for subscription ${stripeSub.id}`);
      return undefined;
    }
    const status = this.mapStatus(stripeSub.status, stripeSub.cancel_at_period_end);
    const periodStart = stripeSub.current_period_start
      ? new Date(stripeSub.current_period_start * 1000)
      : undefined;
    const periodEnd = stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : undefined;

    const subscription: UserSubscription = {
      userId,
      stripeCustomerId: typeof stripeSub.customer === 'string' ? stripeSub.customer : undefined,
      stripeSubscriptionId: stripeSub.id,
      tier,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
    };

    const saved = await this.repository.upsertSubscription(subscription);
    if (periodStart && periodEnd) {
      await this.repository.ensureUsagePeriod(userId, periodStart, periodEnd);
    }
    return saved;
  }

  private mapStatus(status: Stripe.Subscription.Status, cancelAtPeriodEnd?: boolean): SubscriptionStatus {
    if (cancelAtPeriodEnd && status === 'active') {
      return 'canceled';
    }
    switch (status) {
      case 'active':
        return 'active';
      case 'trialing':
        return 'trialing';
      case 'past_due':
        return 'past_due';
      case 'canceled':
        return 'canceled';
      case 'incomplete':
      case 'incomplete_expired':
      case 'unpaid':
        return 'incomplete';
      default:
        return 'incomplete';
    }
  }

  private resolveTier(price: Stripe.Price): BillingTier | undefined {
    const metadataTier = (price.metadata?.tier as BillingTier | undefined) || undefined;
    if (metadataTier) return metadataTier;

    const match = Object.entries(this.priceMap).find(([, id]) => id && id === price.id);
    return match?.[0] as BillingTier | undefined;
  }

  private getPriceId(tier: BillingTier): string | undefined {
    const envKey = TIER_PRICE_ENV_MAP[tier];
    if (!envKey) return undefined;
    return this.configService.get<string>(envKey) || this.priceMap[tier];
  }

  private async createCustomer(userId: string): Promise<string> {
    if (!this.stripe) throw new BadRequestException('Stripe is not configured');
    const customer = await this.stripe.customers.create({ metadata: { user_id: userId } });
    return customer.id;
  }

  private loadPriceMap(): Partial<Record<BillingTier, string>> {
    const entries = Object.entries(TIER_PRICE_ENV_MAP)
      .map(([tier, envKey]) => [tier, this.configService.get<string>(envKey)] as const)
      .filter(([, value]) => Boolean(value)) as Array<[BillingTier, string]>;
    return Object.fromEntries(entries);
  }

  private ensureStripe() {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured');
    }
  }
}
