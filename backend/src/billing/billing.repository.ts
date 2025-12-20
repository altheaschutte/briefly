import { UsagePeriod, UserSubscription } from './billing.types';

export const BILLING_REPOSITORY = 'BILLING_REPOSITORY';

export interface BillingRepository {
  getSubscription(userId: string): Promise<UserSubscription | undefined>;
  findByCustomerId(customerId: string): Promise<UserSubscription | undefined>;
  findBySubscriptionId(subscriptionId: string): Promise<UserSubscription | undefined>;
  upsertSubscription(sub: UserSubscription): Promise<UserSubscription>;
  ensureUsagePeriod(userId: string, periodStart: Date, periodEnd: Date): Promise<UsagePeriod>;
  getUsagePeriod(userId: string, periodStart: Date, periodEnd: Date): Promise<UsagePeriod | undefined>;
  setUsageTotals(userId: string, periodStart: Date, periodEnd: Date, secondsUsed: number): Promise<UsagePeriod>;
}
