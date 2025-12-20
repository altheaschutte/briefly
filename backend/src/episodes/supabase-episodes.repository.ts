import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';
import { Episode } from '../domain/types';
import { EpisodesRepository, ListEpisodesOptions } from './episodes.repository';
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
      title: null,
      episode_number: null,
      status,
      archived_at: null,
      target_duration_minutes: targetDurationMinutes,
      duration_seconds: null,
      audio_url: null,
      cover_image_url: null,
      cover_prompt: null,
      transcript: null,
      script_prompt: null,
      show_notes: null,
      description: null,
      error_message: null,
      created_at: now,
      updated_at: now,
      usage_recorded_at: null,
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

  async listByUser(userId: string, options?: ListEpisodesOptions): Promise<Episode[]> {
    const { includeArchived = false, includeFailed = false } = options || {};
    let query = this.client.from('episodes').select('*').eq('user_id', userId);

    if (!includeFailed) {
      query = query.neq('status', 'failed');
    }
    if (!includeArchived) {
      query = query.is('archived_at', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

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
      .is('archived_at', null)
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
    if (updates.title !== undefined) payload.title = updates.title ?? null;
    if (updates.episodeNumber !== undefined) payload.episode_number = updates.episodeNumber ?? null;
    if (updates.archivedAt !== undefined) payload.archived_at = updates.archivedAt?.toISOString() ?? null;
    if (updates.audioUrl !== undefined) payload.audio_url = updates.audioUrl ?? null;
    if (updates.transcript !== undefined) payload.transcript = updates.transcript ?? null;
    if (updates.scriptPrompt !== undefined) payload.script_prompt = updates.scriptPrompt ?? null;
    if (updates.coverImageUrl !== undefined) payload.cover_image_url = updates.coverImageUrl ?? null;
    if (updates.coverPrompt !== undefined) payload.cover_prompt = updates.coverPrompt ?? null;
    if (updates.showNotes !== undefined) payload.show_notes = updates.showNotes ?? null;
    if (updates.description !== undefined) payload.description = updates.description ?? null;
    if (updates.errorMessage !== undefined) payload.error_message = updates.errorMessage ?? null;
    if (updates.targetDurationMinutes !== undefined)
      payload.target_duration_minutes = updates.targetDurationMinutes;
    if (updates.durationSeconds !== undefined) payload.duration_seconds = updates.durationSeconds ?? null;
    if (updates.usageRecordedAt !== undefined)
      payload.usage_recorded_at = updates.usageRecordedAt?.toISOString() ?? null;

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

  async archive(userId: string, episodeId: string): Promise<Episode | undefined> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('episodes')
      .update({ archived_at: now, updated_at: now })
      .eq('id', episodeId)
      .eq('user_id', userId)
      .is('archived_at', null)
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to archive episode ${episodeId} for user ${userId}: ${error.message}`);
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
      episodeNumber: row.episode_number ?? undefined,
      title: row.title ?? undefined,
      status: row.status as Episode['status'],
      archivedAt: row.archived_at ? new Date(row.archived_at) : undefined,
      targetDurationMinutes: row.target_duration_minutes,
      durationSeconds: row.duration_seconds ?? undefined,
      audioUrl: row.audio_url ?? undefined,
      coverImageUrl: row.cover_image_url ?? undefined,
      coverPrompt: row.cover_prompt ?? undefined,
      transcript: row.transcript ?? undefined,
      scriptPrompt: row.script_prompt ?? undefined,
      showNotes: row.show_notes ?? undefined,
      description: row.description ?? undefined,
      errorMessage: row.error_message ?? undefined,
      usageRecordedAt: row.usage_recorded_at ? new Date(row.usage_recorded_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
