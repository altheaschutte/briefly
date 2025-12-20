import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { EpisodesService } from '../episodes/episodes.service';
import { BILLING_REPOSITORY, BillingRepository } from './billing.repository';
import { Entitlements, SubscriptionStatus } from './billing.types';
import { TIER_LIMITS } from './billing.constants';

@Injectable()
export class EntitlementsService {
  private readonly logger = new Logger(EntitlementsService.name);
  private readonly defaultDurationMinutes: number;

  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repository: BillingRepository,
    private readonly billingService: BillingService,
    private readonly episodesService: EpisodesService,
    private readonly configService: ConfigService,
  ) {
    this.defaultDurationMinutes = Number(this.configService.get('EPISODE_DEFAULT_DURATION_MINUTES')) || 20;
  }

  getDefaultDurationMinutes(): number {
    return this.defaultDurationMinutes;
  }

  async getEntitlements(userId: string): Promise<Entitlements> {
    let liveSubscription: Awaited<ReturnType<BillingService['getLiveSubscriptionForUser']>> | null = null;
    try {
      liveSubscription = await this.billingService.getLiveSubscriptionForUser(userId);
    } catch (error) {
      this.logger.warn(
        `Falling back to default entitlements for user ${userId}: ${error instanceof Error ? error.message : error}`,
      );
    }
    const status: SubscriptionStatus = liveSubscription?.status ?? 'none';
    const isActive = this.isSubscriptionActive(status);
    const tier = isActive && liveSubscription?.tier ? liveSubscription.tier : 'free';
    const { periodStart, periodEnd } = this.resolvePeriod({
      currentPeriodStart: liveSubscription?.subscription.current_period_start
        ? new Date(liveSubscription.subscription.current_period_start * 1000)
        : undefined,
      currentPeriodEnd: liveSubscription?.subscription.current_period_end
        ? new Date(liveSubscription.subscription.current_period_end * 1000)
        : undefined,
    });
    const usagePeriod =
      (await this.repository.getUsagePeriod(userId, periodStart, periodEnd)) ||
      (await this.repository.ensureUsagePeriod(userId, periodStart, periodEnd));

    const limits = TIER_LIMITS[tier];
    const secondsLimit = limits.minutesPerMonth ? limits.minutesPerMonth * 60 : undefined;
    const secondsUsed = Number(usagePeriod.secondsUsed ?? 0);
    const secondsRemaining =
      secondsLimit !== undefined ? Math.max(0, secondsLimit - secondsUsed) : undefined;

    return {
      tier,
      status,
      limits,
      periodStart,
      periodEnd,
      secondsUsed,
      secondsLimit,
      secondsRemaining,
      cancelAtPeriodEnd: Boolean(liveSubscription?.subscription.cancel_at_period_end ?? false),
    };
  }

  async ensureCanCreateEpisode(userId: string, requestedDurationMinutes?: number): Promise<void> {
    const durationMinutes = requestedDurationMinutes ?? this.defaultDurationMinutes;
    const entitlements = await this.getEntitlements(userId);
    const limits = entitlements.limits;

    if (durationMinutes > limits.maxEpisodeMinutes) {
      throw new ForbiddenException(
        `Your ${entitlements.tier} plan allows up to ${limits.maxEpisodeMinutes}-minute episodes.`,
      );
    }

    const requiredSeconds = durationMinutes * 60;
    if (entitlements.secondsLimit !== undefined && entitlements.secondsRemaining !== undefined) {
      if (entitlements.secondsRemaining < requiredSeconds) {
        throw new ForbiddenException(
          `You have ${Math.floor(entitlements.secondsRemaining / 60)} minutes remaining this period.`,
        );
      }
    }
  }

  async recordEpisodeUsage(userId: string, episodeId: string, durationSeconds: number): Promise<void> {
    try {
      const episode = await this.episodesService.getEpisode(userId, episodeId);
      if (episode.usageRecordedAt) {
        return;
      }
      const entitlements = await this.getEntitlements(userId);
      const usagePeriod =
        (await this.repository.getUsagePeriod(userId, entitlements.periodStart, entitlements.periodEnd)) ||
        (await this.repository.ensureUsagePeriod(userId, entitlements.periodStart, entitlements.periodEnd));
      const nextSeconds = Math.max(0, Number(usagePeriod.secondsUsed ?? 0) + Math.max(durationSeconds, 0));
      await this.repository.setUsageTotals(userId, entitlements.periodStart, entitlements.periodEnd, nextSeconds);
      await this.episodesService.updateEpisode(userId, episodeId, { usageRecordedAt: new Date() });
    } catch (error) {
      this.logger.error(
        `Failed to record usage for episode ${episodeId}: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  private isSubscriptionActive(status: SubscriptionStatus | undefined): boolean {
    if (!status) return false;
    // Treat incomplete subscriptions as inactive so users without a finished purchase stay on the free tier
    return status === 'active' || status === 'trialing' || status === 'past_due';
  }

  private resolvePeriod(subscription?: { currentPeriodStart?: Date | null; currentPeriodEnd?: Date | null }): {
    periodStart: Date;
    periodEnd: Date;
  } {
    if (subscription?.currentPeriodStart && subscription.currentPeriodEnd) {
      return {
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
      };
    }

    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
    return { periodStart: start, periodEnd: end };
  }
}
