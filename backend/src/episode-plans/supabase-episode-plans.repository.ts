import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';
import { handleSupabaseErrors } from '../common/supabase.util';
import { EpisodePlan } from './episode-plans.types';
import { EPISODE_PLANS_REPOSITORY, EpisodePlansRepository } from './episode-plans.repository';
import { EpisodePlanRow } from './episode-plans.supabase-types';

@Injectable()
export class SupabaseEpisodePlansRepository implements EpisodePlansRepository {
  private readonly client: SupabaseClient;
  private readonly logger = new Logger(SupabaseEpisodePlansRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase URL and service role key are required for SupabaseEpisodePlansRepository');
    }

    this.client = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async create(input: {
    userId: string;
    resourceId: string;
    threadId?: string | undefined;
    assistantMessage?: string | undefined;
    confidence?: number | undefined;
    episodeSpec: unknown;
    userProfile?: unknown;
  }): Promise<EpisodePlan> {
    const now = new Date().toISOString();
    const payload: EpisodePlanRow = {
      id: uuid(),
      user_id: input.userId,
      resource_id: input.resourceId,
      thread_id: input.threadId ?? null,
      assistant_message: input.assistantMessage ?? null,
      confidence: input.confidence ?? null,
      episode_spec: input.episodeSpec,
      user_profile: input.userProfile ?? null,
      created_at: now,
      updated_at: now,
    };

    return handleSupabaseErrors(this.logger, `create episode plan for user ${input.userId}`, async () => {
      const { data, error } = await this.client.from('episode_plans').insert(payload).select().maybeSingle();
      if (error) {
        this.logger.error(`Failed to create episode plan for user ${input.userId}: ${error.message}`);
        throw error;
      }
      if (!data) {
        throw new Error('Supabase did not return an episode plan row after insert');
      }
      return this.mapRow(data as EpisodePlanRow);
    });
  }

  async getById(userId: string, planId: string): Promise<EpisodePlan | undefined> {
    return handleSupabaseErrors(this.logger, `fetch episode plan ${planId} for user ${userId}`, async () => {
      const { data, error } = await this.client
        .from('episode_plans')
        .select('*')
        .eq('id', planId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        this.logger.error(`Failed to fetch episode plan ${planId} for user ${userId}: ${error.message}`);
        throw error;
      }
      if (!data) return undefined;
      return this.mapRow(data as EpisodePlanRow);
    });
  }

  private mapRow(row: EpisodePlanRow): EpisodePlan {
    return {
      id: row.id,
      userId: row.user_id,
      resourceId: row.resource_id,
      threadId: row.thread_id ?? undefined,
      assistantMessage: row.assistant_message ?? undefined,
      confidence: row.confidence ?? undefined,
      episodeSpec: row.episode_spec,
      userProfile: row.user_profile ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const supabaseEpisodePlansRepositoryProvider = {
  provide: EPISODE_PLANS_REPOSITORY,
  useClass: SupabaseEpisodePlansRepository,
};
