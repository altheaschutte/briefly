import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { EpisodeSegment } from '../domain/types';
import { EpisodeSegmentRow, SupabaseDatabase } from './episodes.supabase-types';
import { EpisodeSegmentsRepository } from './episode-segments.repository';

@Injectable()
export class SupabaseEpisodeSegmentsRepository implements EpisodeSegmentsRepository {
  private readonly client: SupabaseClient<SupabaseDatabase>;
  private readonly logger = new Logger(SupabaseEpisodeSegmentsRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase URL and service role key are required for SupabaseEpisodeSegmentsRepository');
    }

    this.client = createClient<SupabaseDatabase>(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async replaceForEpisode(episodeId: string, segments: EpisodeSegment[]): Promise<EpisodeSegment[]> {
    const { error: deleteError } = await this.client.from('episode_segments').delete().eq('episode_id', episodeId);
    if (deleteError) {
      this.logger.error(`Failed to clear segments for episode ${episodeId}: ${deleteError.message}`);
      throw deleteError;
    }

    if (!segments.length) {
      return [];
    }

    const now = new Date().toISOString();
    const payload: EpisodeSegmentRow[] = segments.map((segment) => ({
      id: segment.id,
      episode_id: episodeId,
      order_index: segment.orderIndex,
      title: segment.title ?? null,
      raw_content: segment.rawContent,
      raw_sources: segment.rawSources ?? null,
      script: segment.script ?? null,
      audio_url: segment.audioUrl ?? null,
      start_time_seconds: segment.startTimeSeconds ?? null,
      duration_seconds: segment.durationSeconds ?? null,
      created_at: now,
    }));

    const { data, error } = await this.client.from('episode_segments').insert(payload).select();
    if (error) {
      this.logger.error(`Failed to insert segments for episode ${episodeId}: ${error.message}`);
      throw error;
    }
    const rows = (data as EpisodeSegmentRow[] | null) ?? [];
    return rows.map((row) => this.mapRow(row));
  }

  async listForEpisode(episodeId: string): Promise<EpisodeSegment[]> {
    const { data, error } = await this.client
      .from('episode_segments')
      .select('*')
      .eq('episode_id', episodeId)
      .order('order_index', { ascending: true });

    if (error) {
      this.logger.error(`Failed to fetch segments for episode ${episodeId}: ${error.message}`);
      throw error;
    }
    const rows = (data as EpisodeSegmentRow[] | null) ?? [];
    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: EpisodeSegmentRow): EpisodeSegment {
    return {
      id: row.id,
      episodeId: row.episode_id,
      orderIndex: row.order_index,
      title: row.title ?? undefined,
      rawContent: row.raw_content,
      rawSources: (row.raw_sources as EpisodeSegment['rawSources']) ?? [],
      script: row.script ?? undefined,
      audioUrl: row.audio_url ?? undefined,
      startTimeSeconds: row.start_time_seconds !== null && row.start_time_seconds !== undefined
        ? Number(row.start_time_seconds)
        : undefined,
      durationSeconds:
        row.duration_seconds !== null && row.duration_seconds !== undefined
          ? Number(row.duration_seconds)
          : undefined,
    };
  }
}
