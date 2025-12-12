import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';
import { OnboardingTranscript } from '../domain/types';
import {
  OnboardingTranscriptUpdateInput,
  OnboardingTranscriptsRepository,
} from './onboarding.repository';
import { OnboardingTranscriptRow, SupabaseDatabase } from './onboarding.supabase-types';

@Injectable()
export class SupabaseOnboardingRepository implements OnboardingTranscriptsRepository {
  private readonly client: SupabaseClient<SupabaseDatabase>;
  private readonly logger = new Logger(SupabaseOnboardingRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase URL and service role key are required for SupabaseOnboardingRepository');
    }

    this.client = createClient<SupabaseDatabase>(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async create(userId: string, transcript = ''): Promise<OnboardingTranscript> {
    const now = new Date().toISOString();
    const payload: OnboardingTranscriptRow = {
      id: uuid(),
      user_id: userId,
      transcript,
      status: 'in_progress',
      extracted_topics: [],
      error_message: null,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await this.client
      .from('onboarding_transcripts')
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to create onboarding transcript for user ${userId}: ${error.message}`);
      throw error;
    }

    if (!data) {
      throw new Error('Supabase did not return a transcript row after insert');
    }

    return this.mapRow(data as OnboardingTranscriptRow);
  }

  async update(
    userId: string,
    recordId: string,
    updates: OnboardingTranscriptUpdateInput,
  ): Promise<OnboardingTranscript | undefined> {
    const now = new Date().toISOString();
    const payload: Partial<OnboardingTranscriptRow> = {
      updated_at: now,
    };

    if (updates.transcript !== undefined) {
      payload.transcript = updates.transcript;
    }
    if (updates.status !== undefined) {
      payload.status = updates.status;
    }
    if (updates.extractedTopics !== undefined) {
      payload.extracted_topics = updates.extractedTopics;
    }
    if (updates.errorMessage !== undefined) {
      payload.error_message = updates.errorMessage;
    }

    const { data, error } = await this.client
      .from('onboarding_transcripts')
      .update(payload)
      .eq('id', recordId)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return undefined;
      }
      this.logger.error(
        `Failed to update onboarding transcript ${recordId} for user ${userId}: ${error.message}`,
      );
      throw error;
    }

    if (!data) {
      return undefined;
    }

    return this.mapRow(data as OnboardingTranscriptRow);
  }

  async getById(userId: string, recordId: string): Promise<OnboardingTranscript | undefined> {
    const { data, error } = await this.client
      .from('onboarding_transcripts')
      .select('*')
      .eq('id', recordId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return undefined;
      }
      this.logger.error(
        `Failed to fetch onboarding transcript ${recordId} for user ${userId}: ${error.message}`,
      );
      throw error;
    }

    if (!data) {
      return undefined;
    }

    return this.mapRow(data as OnboardingTranscriptRow);
  }

  private mapRow(row: OnboardingTranscriptRow): OnboardingTranscript {
    return {
      id: row.id,
      userId: row.user_id,
      transcript: row.transcript,
      status: row.status,
      extractedTopics: (row.extracted_topics as string[] | null | undefined) ?? undefined,
      errorMessage: row.error_message ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
