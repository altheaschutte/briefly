import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { BillingRepository } from './billing.repository';
import { UsagePeriod, UserSubscription } from './billing.types';

@Injectable()
export class SupabaseBillingRepository implements BillingRepository {
  private readonly client: SupabaseClient;
  private readonly logger = new Logger(SupabaseBillingRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase URL and service role key are required for SupabaseBillingRepository');
    }

    this.client = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async getSubscription(userId: string): Promise<UserSubscription | undefined> {
    const { data, error } = await this.client
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to fetch subscription for user ${userId}: ${error.message}`);
      throw error;
    }
    if (!data) return undefined;
    return this.mapSubscription(data as UserSubscriptionRow);
  }

  async upsertSubscription(sub: UserSubscription): Promise<UserSubscription> {
    const now = new Date().toISOString();
    const payload: UserSubscriptionInsert = {
      user_id: sub.userId,
      stripe_customer_id: sub.stripeCustomerId ?? null,
      stripe_subscription_id: sub.stripeSubscriptionId ?? null,
      tier: sub.tier,
      status: sub.status,
      current_period_start: sub.currentPeriodStart?.toISOString() ?? null,
      current_period_end: sub.currentPeriodEnd?.toISOString() ?? null,
      cancel_at_period_end: sub.cancelAtPeriodEnd ?? false,
      created_at: sub.updatedAt?.toISOString() ?? now,
      updated_at: now,
    };

    const { data, error } = await this.client
      .from('user_subscriptions')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to upsert subscription for user ${sub.userId}: ${error.message}`);
      throw error;
    }
    if (!data) throw new Error('Supabase did not return subscription after upsert');
    return this.mapSubscription(data as UserSubscriptionRow);
  }

  async findByCustomerId(customerId: string): Promise<UserSubscription | undefined> {
    const { data, error } = await this.client
      .from('user_subscriptions')
      .select('*')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return undefined;
      }
      this.logger.error(`Failed to fetch subscription by customer ${customerId}: ${error.message}`);
      throw error;
    }
    if (!data) return undefined;
    return this.mapSubscription(data as UserSubscriptionRow);
  }

  async findBySubscriptionId(subscriptionId: string): Promise<UserSubscription | undefined> {
    const { data, error } = await this.client
      .from('user_subscriptions')
      .select('*')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return undefined;
      }
      this.logger.error(`Failed to fetch subscription by subscription id ${subscriptionId}: ${error.message}`);
      throw error;
    }
    if (!data) return undefined;
    return this.mapSubscription(data as UserSubscriptionRow);
  }

  async ensureUsagePeriod(userId: string, periodStart: Date, periodEnd: Date): Promise<UsagePeriod> {
    const existing = await this.getUsagePeriod(userId, periodStart, periodEnd);
    if (existing) {
      return existing;
    }

    const payload: UsagePeriodInsert = {
      user_id: userId,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      minutes_used: 0,
      seconds_used: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.client
      .from('usage_periods')
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to ensure usage period for user ${userId}: ${error.message}`);
      throw error;
    }
    if (!data) throw new Error('Supabase did not return usage period after upsert');
    return this.mapUsage(data as UsagePeriodRow);
  }

  async getUsagePeriod(userId: string, periodStart: Date, periodEnd: Date): Promise<UsagePeriod | undefined> {
    const { data, error } = await this.client
      .from('usage_periods')
      .select('*')
      .eq('user_id', userId)
      .eq('period_start', periodStart.toISOString())
      .eq('period_end', periodEnd.toISOString())
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return undefined;
      }
      this.logger.error(`Failed to fetch usage period for user ${userId}: ${error.message}`);
      throw error;
    }
    if (!data) return undefined;
    return this.mapUsage(data as UsagePeriodRow);
  }

  async setUsageTotals(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
    secondsUsed: number,
  ): Promise<UsagePeriod> {
    const { data, error } = await this.client
      .from('usage_periods')
      .update({
        seconds_used: secondsUsed,
        minutes_used: secondsUsed / 60,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('period_start', periodStart.toISOString())
      .eq('period_end', periodEnd.toISOString())
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to update usage for user ${userId}: ${error.message}`);
      throw error;
    }
    if (!data) throw new Error('Supabase did not return usage period after update');
    return this.mapUsage(data as UsagePeriodRow);
  }

  private mapSubscription(row: UserSubscriptionRow): UserSubscription {
    return {
      userId: row.user_id,
      stripeCustomerId: row.stripe_customer_id ?? undefined,
      stripeSubscriptionId: row.stripe_subscription_id ?? undefined,
      tier: row.tier as UserSubscription['tier'],
      status: row.status as UserSubscription['status'],
      currentPeriodStart: row.current_period_start ? new Date(row.current_period_start) : undefined,
      currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end) : undefined,
      cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }

  private mapUsage(row: UsagePeriodRow): UsagePeriod {
    return {
      id: row.id,
      userId: row.user_id,
      periodStart: new Date(row.period_start),
      periodEnd: new Date(row.period_end),
      minutesUsed: Number(row.minutes_used ?? 0),
      secondsUsed: Number(row.seconds_used ?? 0),
      updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
    };
  }
}

type UserSubscriptionRow = {
  user_id: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  tier: string;
  status: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  created_at?: string;
  updated_at?: string;
};

type UserSubscriptionInsert = {
  user_id: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  tier: string;
  status: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type UsagePeriodRow = {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  minutes_used: number;
  seconds_used: number;
  created_at?: string;
  updated_at?: string;
};

type UsagePeriodInsert = {
  id?: string;
  user_id: string;
  period_start: string;
  period_end: string;
  minutes_used?: number;
  seconds_used?: number;
  created_at?: string;
  updated_at?: string;
};

type SupabaseDatabase = {
  public: {
    Tables: {
      user_subscriptions: { Row: UserSubscriptionRow; Insert: UserSubscriptionInsert; Update: Partial<UserSubscriptionRow> };
      usage_periods: { Row: UsagePeriodRow; Insert: UsagePeriodInsert; Update: Partial<UsagePeriodRow> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
