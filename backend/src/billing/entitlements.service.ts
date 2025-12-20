import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EpisodesService } from '../episodes/episodes.service';
import { BILLING_REPOSITORY, BillingRepository } from './billing.repository';
import { BillingTier, Entitlements, SubscriptionStatus } from './billing.types';
import { TIER_LIMITS } from './billing.constants';

@Injectable()
export class EntitlementsService {
  private readonly logger = new Logger(EntitlementsService.name);
  private readonly defaultDurationMinutes: number;

  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repository: BillingRepository,
    private readonly episodesService: EpisodesService,
    private readonly configService: ConfigService,
  ) {
    this.defaultDurationMinutes = Number(this.configService.get('EPISODE_DEFAULT_DURATION_MINUTES')) || 20;
  }

  getDefaultDurationMinutes(): number {
    return this.defaultDurationMinutes;
  }

  async getEntitlements(userId: string): Promise<Entitlements> {
    const subscription = await this.repository.getSubscription(userId);
    const isActive = subscription && this.isSubscriptionActive(subscription.status);
    const tier = isActive ? subscription.tier : 'free';
    const status: SubscriptionStatus = isActive ? subscription.status : 'none';

    const { periodStart, periodEnd } = this.resolvePeriod(subscription);
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
      cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
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
    return status === 'active' || status === 'trialing' || status === 'incomplete' || status === 'past_due';
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
