import { BillingTier, TierLimits } from './billing.types';

export const TIER_LIMITS: Record<BillingTier, TierLimits> = {
  free: { minutesPerMonth: 20, maxActiveTopics: 1, maxEpisodeMinutes: 5, scheduleEnabled: false },
  starter: { minutesPerMonth: 120, maxActiveTopics: 3, maxEpisodeMinutes: 7, scheduleEnabled: false },
  pro: { minutesPerMonth: 300, maxActiveTopics: 5, maxEpisodeMinutes: 10, scheduleEnabled: true },
  power: { minutesPerMonth: 750, maxActiveTopics: 10, maxEpisodeMinutes: 15, scheduleEnabled: true },
};

export const TIER_PRICE_ENV_MAP: Record<BillingTier, string> = {
  free: '',
  starter: 'STRIPE_STARTER_PRICE_ID',
  pro: 'STRIPE_PRO_PRICE_ID',
  power: 'STRIPE_POWER_PRICE_ID',
};
