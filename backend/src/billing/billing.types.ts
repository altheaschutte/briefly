export type BillingTier = 'free' | 'starter' | 'pro' | 'power';

export type SubscriptionStatus = 'none' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';

export interface TierLimits {
  minutesPerMonth: number | null;
  maxActiveTopics: number;
  maxEpisodeMinutes: number;
  scheduleEnabled: boolean;
}

export interface Entitlements {
  tier: BillingTier;
  status: SubscriptionStatus;
  limits: TierLimits;
  periodStart: Date;
  periodEnd: Date;
  secondsUsed: number;
  secondsLimit?: number;
  secondsRemaining?: number;
  cancelAtPeriodEnd: boolean;
}

export interface UserSubscription {
  userId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  tier: BillingTier;
  status: SubscriptionStatus;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  updatedAt?: Date;
}

export interface UsagePeriod {
  id: string;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  minutesUsed: number;
  secondsUsed: number;
  updatedAt: Date;
}
