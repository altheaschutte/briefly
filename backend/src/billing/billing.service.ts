import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { BILLING_REPOSITORY, BillingRepository } from './billing.repository';
import {
  BillingTier,
  BillingTierInfo,
  SubscriptionStatus,
  TierLimits,
} from './billing.types';
import { TIER_LIMITS, TIER_PRICE_ENV_MAP } from './billing.constants';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe?: Stripe;
  private readonly priceMap: Partial<Record<BillingTier, string>>;
  private readonly webhookSecret?: string;
  private readonly appWebUrl: string;
  private static readonly AVERAGE_DAYS_PER_MONTH = 30;
  private static readonly SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const;

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

  async getLiveSubscriptionForUser(
    userId: string,
  ): Promise<
    | {
        customerId: string;
        subscription: Stripe.Subscription;
        status: SubscriptionStatus;
        tier?: BillingTier;
      }
    | null
  > {
    this.ensureStripe();
    const customer = await this.findStripeCustomer(userId);
    if (!customer) return null;

    const { data } = await this.stripe!.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 20,
      expand: ['data.items.data.price'],
    });

    if (!data.length) return null;

    const ordered = [...data].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
    const subscription =
      ordered.find((sub) => BillingService.SUBSCRIPTION_STATUSES.includes(sub.status as (typeof BillingService.SUBSCRIPTION_STATUSES)[number])) ||
      ordered.find((sub) => sub.status !== 'canceled') ||
      ordered[0];
    if (!subscription) return null;

    const price = subscription.items?.data?.[0]?.price;
    const tier = price ? this.resolveTier(price) : undefined;
    const status = this.mapStatus(subscription.status, subscription.cancel_at_period_end ?? undefined);

    try {
      await this.repository.upsertSubscription({
        userId,
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        tier: 'free',
        status: 'none',
      });
    } catch (error) {
      this.logger.warn(
        `Could not persist Stripe subscription mapping for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      customerId: customer.id,
      subscription,
      status,
      tier,
    };
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

    const customer = await this.ensureCustomer(userId);
    const customerId = customer.id;
    const session = await this.stripe!.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.appWebUrl}/billing/success`,
      cancel_url: `${this.appWebUrl}/billing/canceled`,
      client_reference_id: userId,
      subscription_data: {
        metadata: { user_id: userId, tier },
      },
      metadata: { user_id: userId, tier },
    });

    return { url: session.url };
  }

  async getTiers(): Promise<BillingTierInfo[]> {
    const tiers = (Object.keys(TIER_LIMITS) as BillingTier[]).map(async (tier) => {
      const limits = TIER_LIMITS[tier];
      const priceId = this.getPriceId(tier);
      const price = await this.getPriceDetails(priceId);

      return {
        tier,
        limits,
        priceId,
        description: this.describeTier(tier, limits),
        priceAmount: price?.unit_amount ?? null,
        priceCurrency: price?.currency ?? null,
      };
    });

    return Promise.all(tiers);
  }

  private describeTier(tier: BillingTier, limits: TierLimits): string {
    if (tier === 'free') {
      return 'Free trial with 3 x 20-minute episodes.';
    }

    const minutesPerMonth = limits.minutesPerMonth;
    if (minutesPerMonth === null) {
      return 'Unlimited minutes per month—listen as much as you want every day.';
    }
    const dailyMinutes = Math.max(
      1,
      Math.round(minutesPerMonth / BillingService.AVERAGE_DAYS_PER_MONTH),
    );
    const dailyText =
      dailyMinutes >= 120 && dailyMinutes % 60 === 0
        ? `${dailyMinutes / 60} hr/day`
        : `${dailyMinutes} min/day`;
    return `${minutesPerMonth} minutes per month (~${dailyText}).`;
  }

  private async getPriceDetails(priceId?: string): Promise<Stripe.Price | undefined> {
    if (!priceId || !this.stripe) return undefined;
    try {
      return await this.stripe.prices.retrieve(priceId);
    } catch (error) {
      this.logger.warn(
        `Could not retrieve Stripe price ${priceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  async createPortalSession(userId: string): Promise<{ url: string | null }> {
    this.ensureStripe();
    const customer = await this.ensureCustomer(userId);

    const session = await this.stripe!.billingPortal.sessions.create({
      customer: customer.id,
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
    const subscription = await this.stripe!.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });
    const userId =
      (subscription.metadata?.user_id as string) ||
      (await this.repository.findBySubscriptionId(subscriptionId))?.userId;
    if (!userId) {
      this.logger.warn(`Invoice event for ${subscriptionId} without mapped user`);
      return;
    }

    await this.syncSubscription({ ...subscription, status } as Stripe.Subscription, userId);
  }

  private async syncSubscription(stripeSub: Stripe.Subscription, userId: string): Promise<void> {
    const periodStart = stripeSub.current_period_start
      ? new Date(stripeSub.current_period_start * 1000)
      : undefined;
    const periodEnd = stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : undefined;
    const isActive = BillingService.SUBSCRIPTION_STATUSES.includes(
      stripeSub.status as (typeof BillingService.SUBSCRIPTION_STATUSES)[number],
    );

    try {
      await this.repository.upsertSubscription({
        userId,
        stripeCustomerId: typeof stripeSub.customer === 'string' ? stripeSub.customer : undefined,
        stripeSubscriptionId: stripeSub.id,
        tier: 'free',
        status: 'none',
      });
    } catch (error) {
      this.logger.warn(
        `Could not persist subscription mapping for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (isActive && periodStart && periodEnd) {
      try {
        await this.repository.ensureUsagePeriod(userId, periodStart, periodEnd);
      } catch (error) {
        this.logger.warn(
          `Could not ensure usage period for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
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

  private async findStripeCustomer(userId: string): Promise<Stripe.Customer | null> {
    const existing = await this.repository.getSubscription(userId).catch(() => undefined);
    if (existing?.stripeCustomerId) {
      const customer = await this.retrieveCustomer(existing.stripeCustomerId);
      if (customer) return customer;
    }

    const searchCustomer = await this.searchCustomerByMetadata(userId);
    if (searchCustomer) return searchCustomer;

    const listedCustomer = await this.findCustomerFromList(userId);
    if (listedCustomer) return listedCustomer;

    return null;
  }

  private async retrieveCustomer(customerId: string): Promise<Stripe.Customer | null> {
    try {
      const customer = await this.stripe!.customers.retrieve(customerId);
      if (!('deleted' in customer) || !customer.deleted) {
        return customer as Stripe.Customer;
      }
    } catch (error) {
      this.logger.warn(
        `Could not retrieve Stripe customer ${customerId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  }

  private async searchCustomerByMetadata(userId: string): Promise<Stripe.Customer | null> {
    try {
      if (typeof this.stripe!.customers.search !== 'function') return null;
      const { data } = await this.stripe!.customers.search({
        query: `metadata['user_id']:'${userId}'`,
        limit: 1,
      });
      const match = data.find((c) => !('deleted' in c));
      return (match as Stripe.Customer | undefined) ?? null;
    } catch (error) {
      this.logger.warn(
        `Stripe customer search failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async findCustomerFromList(userId: string): Promise<Stripe.Customer | null> {
    try {
      const { data } = await this.stripe!.customers.list({ limit: 50 });
      const match = data.find(
        (c) => !('deleted' in c) && (c as Stripe.Customer).metadata?.user_id === userId,
      ) as Stripe.Customer | undefined;
      return match ?? null;
    } catch (error) {
      this.logger.warn(
        `Could not list Stripe customers to resolve user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async ensureCustomer(userId: string): Promise<Stripe.Customer> {
    const existing = await this.findStripeCustomer(userId);
    if (existing) return existing;
    const created = await this.createCustomer(userId);
    try {
      await this.repository.upsertSubscription({
        userId,
        stripeCustomerId: created.id,
        tier: 'free',
        status: 'none',
      });
    } catch (error) {
      this.logger.warn(
        `Could not persist Stripe customer mapping for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return created;
  }

  private getPriceId(tier: BillingTier): string | undefined {
    const envKey = TIER_PRICE_ENV_MAP[tier];
    if (!envKey) return undefined;
    return this.configService.get<string>(envKey) || this.priceMap[tier];
  }

  private async createCustomer(userId: string): Promise<Stripe.Customer> {
    if (!this.stripe) throw new BadRequestException('Stripe is not configured');
    const customer = await this.stripe.customers.create({ metadata: { user_id: userId } });
    return customer as Stripe.Customer;
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
