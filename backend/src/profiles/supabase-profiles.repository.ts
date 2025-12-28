import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { UserProfile } from '../domain/types';
import { ProfilesRepository } from './profiles.repository';
import { ProfilesDatabase, ProfileRow } from './profiles.supabase-types';

@Injectable()
export class SupabaseProfilesRepository implements ProfilesRepository {
  private readonly client: SupabaseClient<ProfilesDatabase>;
  private readonly logger = new Logger(SupabaseProfilesRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase URL and service role key are required for SupabaseProfilesRepository');
    }

    this.client = createClient<ProfilesDatabase>(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async getByUserId(userId: string): Promise<UserProfile | undefined> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return undefined;
      }
      this.logger.error(`Failed to fetch profile for user ${userId}: ${error.message}`);
      throw error;
    }
    if (!data) {
      return undefined;
    }
    return this.mapRow(data as ProfileRow);
  }

  async upsertProfile(profile: UserProfile): Promise<UserProfile> {
    const payload: ProfileRow = {
      id: profile.id,
      first_name: profile.firstName,
      intention: profile.intention,
      user_about_context: profile.userAboutContext,
      timezone: profile.timezone,
      created_at: profile.createdAt.toISOString(),
      updated_at: profile.updatedAt.toISOString(),
    };

    const { data, error } = await this.client
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to upsert profile for user ${profile.id}: ${error.message}`);
      throw error;
    }
    if (!data) {
      throw new Error('Supabase did not return a profile row after upsert');
    }
    return this.mapRow(data as ProfileRow);
  }

  async updateTimezone(userId: string, timezone: string): Promise<UserProfile | undefined> {
    const existing = await this.getByUserId(userId);
    if (!existing) {
      const fallback: UserProfile = {
        id: userId,
        firstName: 'Friend',
        intention: 'Not provided',
        userAboutContext: 'Not provided',
        timezone,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return this.upsertProfile(fallback);
    }
    const { data, error } = await this.client
      .from('profiles')
      .update({ timezone, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .maybeSingle();
    if (error) {
      this.logger.error(`Failed to update profile timezone for user ${userId}: ${error.message}`);
      throw error;
    }
    if (!data) return undefined;
    return this.mapRow(data as ProfileRow);
  }

  private mapRow(row: ProfileRow): UserProfile {
    return {
      id: row.id,
      firstName: row.first_name,
      intention: row.intention,
      userAboutContext: row.user_about_context,
      timezone: row.timezone,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
