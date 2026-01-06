import { BillingTier, TierLimits } from './billing.types';

export const TIER_LIMITS: Record<BillingTier, TierLimits> = {
  free: { minutesPerMonth: 120, maxActiveTopics: 5, maxEpisodeMinutes: 60, scheduleEnabled: false },
  starter: { minutesPerMonth: 450, maxActiveTopics: 5, maxEpisodeMinutes: 60, scheduleEnabled: true },
  pro: { minutesPerMonth: 900, maxActiveTopics: 5, maxEpisodeMinutes: 60, scheduleEnabled: true },
  power: { minutesPerMonth: 3600, maxActiveTopics: 5, maxEpisodeMinutes: 60, scheduleEnabled: true },
};
