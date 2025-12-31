import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { SegmentDiveDeeperSeed } from '../domain/types';
import { handleSupabaseErrors } from '../common/supabase.util';
import { SegmentDiveDeeperSeedsRepository } from './segment-dive-deeper-seeds.repository';
import { SegmentDiveDeeperSeedRow, SupabaseDatabase } from './episodes.supabase-types';

@Injectable()
export class SupabaseSegmentDiveDeeperSeedsRepository implements SegmentDiveDeeperSeedsRepository {
  private readonly client: SupabaseClient<SupabaseDatabase>;
  private readonly logger = new Logger(SupabaseSegmentDiveDeeperSeedsRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase URL and service role key are required for SupabaseSegmentDiveDeeperSeedsRepository');
    }

    this.client = createClient<SupabaseDatabase>(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async replaceForEpisode(episodeId: string, seeds: SegmentDiveDeeperSeed[]): Promise<SegmentDiveDeeperSeed[]> {
    return handleSupabaseErrors(this.logger, `replace dive deeper seeds for episode ${episodeId}`, async () => {
      if (!seeds.length) {
        const { error: deleteError } = await this.client
          .from('segment_dive_deeper_seeds')
          .delete()
          .eq('episode_id', episodeId);
        if (deleteError) {
          this.logger.error(`Failed to clear dive deeper seeds for episode ${episodeId}: ${deleteError.message}`);
          throw deleteError;
        }
        return [];
      }

      const now = new Date().toISOString();

      const { data: existingData, error: existingError } = await this.client
        .from('segment_dive_deeper_seeds')
        .select('*')
        .eq('episode_id', episodeId);
      if (existingError) {
        this.logger.error(`Failed to fetch existing dive deeper seeds for episode ${episodeId}: ${existingError.message}`);
        throw existingError;
      }

      const existingRows = (existingData as SegmentDiveDeeperSeedRow[] | null) ?? [];
      const existingBySegmentId = new Map(existingRows.map((row) => [row.segment_id, row]));

      const payload: SegmentDiveDeeperSeedRow[] = seeds.map((seed) => {
        const existing = existingBySegmentId.get(seed.segmentId);
        return {
          id: existing?.id ?? seed.id,
          episode_id: episodeId,
          segment_id: seed.segmentId,
          position: seed.position ?? null,
          title: seed.title,
          angle: seed.angle,
          focus_claims: seed.focusClaims ?? [],
          seed_queries: seed.seedQueries ?? [],
          context_bundle: seed.contextBundle ?? {},
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
      });

      const { data, error } = await this.client
        .from('segment_dive_deeper_seeds')
        .upsert(payload, { onConflict: 'segment_id' })
        .select();
      if (error) {
        this.logger.error(`Failed to upsert dive deeper seeds for episode ${episodeId}: ${error.message}`);
        throw error;
      }
      const rows = (data as SegmentDiveDeeperSeedRow[] | null) ?? [];
      return rows.map((row) => this.mapRow(row));
    });
  }

  async listForEpisode(episodeId: string): Promise<SegmentDiveDeeperSeed[]> {
    return handleSupabaseErrors(this.logger, `list dive deeper seeds for episode ${episodeId}`, async () => {
      const { data, error } = await this.client
        .from('segment_dive_deeper_seeds')
        .select('*')
        .eq('episode_id', episodeId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        this.logger.error(`Failed to list dive deeper seeds for episode ${episodeId}: ${error.message}`);
        throw error;
      }
      const rows = (data as SegmentDiveDeeperSeedRow[] | null) ?? [];
      return rows.map((row) => this.mapRow(row));
    });
  }

  async getById(seedId: string): Promise<SegmentDiveDeeperSeed | undefined> {
    return handleSupabaseErrors(this.logger, `fetch dive deeper seed ${seedId}`, async () => {
      const { data, error } = await this.client.from('segment_dive_deeper_seeds').select('*').eq('id', seedId).maybeSingle();
      if (error) {
        if (error.code === 'PGRST116') {
          return undefined;
        }
        this.logger.error(`Failed to fetch dive deeper seed ${seedId}: ${error.message}`);
        throw error;
      }
      if (!data) {
        return undefined;
      }
      return this.mapRow(data as SegmentDiveDeeperSeedRow);
    });
  }

  private mapRow(row: SegmentDiveDeeperSeedRow): SegmentDiveDeeperSeed {
    return {
      id: row.id,
      episodeId: row.episode_id,
      segmentId: row.segment_id,
      position: row.position !== null && row.position !== undefined ? Number(row.position) : undefined,
      title: row.title,
      angle: row.angle,
      focusClaims: Array.isArray(row.focus_claims) ? (row.focus_claims as string[]) : [],
      seedQueries: Array.isArray(row.seed_queries) ? (row.seed_queries as string[]) : [],
      contextBundle: (row.context_bundle as any) ?? {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
