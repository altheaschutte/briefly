import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';
import { DeviceToken, DeviceTokensRepository } from './device-tokens.repository';
import { DeviceTokenRow, SupabaseDatabase } from './device-tokens.supabase-types';

@Injectable()
export class SupabaseDeviceTokensRepository implements DeviceTokensRepository {
  private readonly client: SupabaseClient<SupabaseDatabase>;
  private readonly logger = new Logger(SupabaseDeviceTokensRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase URL and service role key are required for SupabaseDeviceTokensRepository');
    }

    this.client = createClient<SupabaseDatabase>(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async upsert(userId: string, token: string, platform: string): Promise<DeviceToken> {
    const normalizedPlatform = platform.trim().toLowerCase() || 'unknown';
    const now = new Date().toISOString();
    const payload: DeviceTokenRow = {
      id: uuid(),
      user_id: userId,
      platform: normalizedPlatform,
      token,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await this.client
      .from('device_tokens')
      .upsert(payload, { onConflict: 'token' })
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to upsert device token for user ${userId}: ${error.message}`);
      throw error;
    }
    if (!data) {
      throw new Error('Supabase did not return a device token row after upsert');
    }
    return this.mapRow(data as DeviceTokenRow);
  }

  async listByUser(userId: string): Promise<DeviceToken[]> {
    const { data, error } = await this.client.from('device_tokens').select('*').eq('user_id', userId);
    if (error) {
      this.logger.error(`Failed to list device tokens for user ${userId}: ${error.message}`);
      throw error;
    }
    const rows = (data as DeviceTokenRow[] | null) ?? [];
    return rows.map((row) => this.mapRow(row));
  }

  async delete(userId: string, token: string): Promise<void> {
    const { error } = await this.client.from('device_tokens').delete().eq('user_id', userId).eq('token', token);
    if (error) {
      this.logger.error(`Failed to delete device token for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  private mapRow(row: DeviceTokenRow): DeviceToken {
    return {
      id: row.id,
      userId: row.user_id,
      platform: row.platform,
      token: row.token,
      lastSeenAt: new Date(row.last_seen_at),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
