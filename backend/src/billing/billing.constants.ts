import { BillingTier, TierLimits } from './billing.types';

export const TIER_LIMITS: Record<BillingTier, TierLimits> = {
  free: { minutesPerMonth: 60, maxActiveTopics: 5, maxEpisodeMinutes: 60, scheduleEnabled: false },
  starter: { minutesPerMonth: 450, maxActiveTopics: 5, maxEpisodeMinutes: 60, scheduleEnabled: true },
  pro: { minutesPerMonth: 900, maxActiveTopics: 5, maxEpisodeMinutes: 60, scheduleEnabled: true },
  power: { minutesPerMonth: 3600, maxActiveTopics: 5, maxEpisodeMinutes: 60, scheduleEnabled: true },
};

export const TIER_PRICE_ENV_MAP: Record<BillingTier, string> = {
  free: '',
  starter: 'STRIPE_STARTER_PRICE_ID',
  pro: 'STRIPE_PRO_PRICE_ID',
  power: 'STRIPE_POWER_PRICE_ID',
};
