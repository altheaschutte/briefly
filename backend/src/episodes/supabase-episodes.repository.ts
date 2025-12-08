import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';
import { Episode } from '../domain/types';
import { EpisodesRepository } from './episodes.repository';
import { EpisodeRow, SupabaseDatabase } from './episodes.supabase-types';

@Injectable()
export class SupabaseEpisodesRepository implements EpisodesRepository {
  private readonly client: SupabaseClient<SupabaseDatabase>;
  private readonly logger = new Logger(SupabaseEpisodesRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase URL and service role key are required for SupabaseEpisodesRepository');
    }

    this.client = createClient<SupabaseDatabase>(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async create(userId: string, targetDurationMinutes: number, status: Episode['status']): Promise<Episode> {
    const now = new Date().toISOString();
    const payload: EpisodeRow = {
      id: uuid(),
      user_id: userId,
      status,
      target_duration_minutes: targetDurationMinutes,
      audio_url: null,
      transcript: null,
      script_prompt: null,
      error_message: null,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await this.client.from('episodes').insert(payload).select().maybeSingle();
    if (error) {
      this.logger.error(`Failed to create episode for user ${userId}: ${error.message}`);
      throw error;
    }
    if (!data) {
      throw new Error('Supabase did not return an episode row after insert');
    }
    return this.mapRow(data as EpisodeRow);
  }

  async listByUser(userId: string): Promise<Episode[]> {
    const { data, error } = await this.client
      .from('episodes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Failed to list episodes for user ${userId}: ${error.message}`);
      throw error;
    }
    const rows = (data as EpisodeRow[] | null) ?? [];
    return rows.map((row) => this.mapRow(row));
  }

  async getById(userId: string, episodeId: string): Promise<Episode | undefined> {
    const { data, error } = await this.client
      .from('episodes')
      .select('*')
      .eq('id', episodeId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to fetch episode ${episodeId} for user ${userId}: ${error.message}`);
      throw error;
    }
    if (!data) {
      return undefined;
    }
    return this.mapRow(data as EpisodeRow);
  }

  async update(userId: string, episodeId: string, updates: Partial<Episode>): Promise<Episode | undefined> {
    const now = new Date().toISOString();
    const payload: Partial<EpisodeRow> = {
      updated_at: now,
    };

    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.audioUrl !== undefined) payload.audio_url = updates.audioUrl ?? null;
    if (updates.transcript !== undefined) payload.transcript = updates.transcript ?? null;
    if (updates.scriptPrompt !== undefined) payload.script_prompt = updates.scriptPrompt ?? null;
    if (updates.errorMessage !== undefined) payload.error_message = updates.errorMessage ?? null;
    if (updates.targetDurationMinutes !== undefined)
      payload.target_duration_minutes = updates.targetDurationMinutes;

    const { data, error } = await this.client
      .from('episodes')
      .update(payload)
      .eq('id', episodeId)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to update episode ${episodeId} for user ${userId}: ${error.message}`);
      throw error;
    }
    if (!data) {
      return undefined;
    }
    return this.mapRow(data as EpisodeRow);
  }

  private mapRow(row: EpisodeRow): Episode {
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status as Episode['status'],
      targetDurationMinutes: row.target_duration_minutes,
      audioUrl: row.audio_url ?? undefined,
      transcript: row.transcript ?? undefined,
      scriptPrompt: row.script_prompt ?? undefined,
      errorMessage: row.error_message ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
