import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { EpisodeSource } from '../domain/types';
import { EpisodeSourceRow, SupabaseDatabase } from './episodes.supabase-types';
import { EpisodeSourcesRepository } from './episode-sources.repository';
import { handleSupabaseErrors } from '../common/supabase.util';

@Injectable()
export class SupabaseEpisodeSourcesRepository implements EpisodeSourcesRepository {
  private readonly client: SupabaseClient<SupabaseDatabase>;
  private readonly logger = new Logger(SupabaseEpisodeSourcesRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase URL and service role key are required for SupabaseEpisodeSourcesRepository');
    }

    this.client = createClient<SupabaseDatabase>(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async replaceForEpisode(episodeId: string, sources: EpisodeSource[]): Promise<EpisodeSource[]> {
    return handleSupabaseErrors(this.logger, `replace sources for episode ${episodeId}`, async () => {
      const { error: deleteError } = await this.client.from('episode_sources').delete().eq('episode_id', episodeId);
      if (deleteError) {
        this.logger.error(`Failed to clear sources for episode ${episodeId}: ${deleteError.message}`);
        throw deleteError;
      }

      if (!sources.length) {
        return [];
      }

      const now = new Date().toISOString();
      const payload: EpisodeSourceRow[] = sources.map((source) => ({
        id: source.id,
        episode_id: episodeId,
        segment_id: source.segmentId ?? null,
        source_title: source.sourceTitle,
        url: source.url,
        type: source.type ?? null,
        created_at: now,
      }));

      const { data, error } = await this.client.from('episode_sources').insert(payload).select();
      if (error) {
        this.logger.error(`Failed to insert sources for episode ${episodeId}: ${error.message}`);
        throw error;
      }

      const rows = (data as EpisodeSourceRow[] | null) ?? [];
      return rows.map((row) => this.mapRow(row));
    });
  }

  async listForEpisode(episodeId: string): Promise<EpisodeSource[]> {
    return handleSupabaseErrors(this.logger, `list sources for episode ${episodeId}`, async () => {
      const { data, error } = await this.client
        .from('episode_sources')
        .select('*')
        .eq('episode_id', episodeId)
        .order('created_at', { ascending: true });

      if (error) {
        this.logger.error(`Failed to fetch sources for episode ${episodeId}: ${error.message}`);
        throw error;
      }

      const rows = (data as EpisodeSourceRow[] | null) ?? [];
      return rows.map((row) => this.mapRow(row));
    });
  }

  private mapRow(row: EpisodeSourceRow): EpisodeSource {
    return {
      id: row.id,
      episodeId: row.episode_id,
      segmentId: row.segment_id ?? undefined,
      sourceTitle: row.source_title,
      url: row.url,
      type: row.type ?? undefined,
    };
  }
}
