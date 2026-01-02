import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { handleSupabaseErrors } from '../common/supabase.util';
import { LlmUsageRepository } from './llm-usage.repository';
import { LlmUsageRecord } from './llm-usage.types';
import { LlmUsageEventRow, SupabaseDatabase } from './llm-usage.supabase-types';

export class SupabaseLlmUsageRepository implements LlmUsageRepository {
  private readonly client: SupabaseClient<SupabaseDatabase>;
  private readonly logger = new Logger(SupabaseLlmUsageRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || this.configService.get<string>('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase URL and service role key are required for SupabaseLlmUsageRepository');
    }
    this.client = createClient<SupabaseDatabase>(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
  }

  async create(record: LlmUsageRecord): Promise<void> {
    const row = this.toRow(record);
    await handleSupabaseErrors(this.logger, `insert llm_usage_event`, async () => {
      const result = await this.client.from('llm_usage_events').insert(row);
      if (result.error) {
        throw result.error;
      }
    });
  }

  async listByEpisode(userId: string, episodeId: string): Promise<LlmUsageRecord[]> {
    return handleSupabaseErrors(this.logger, `list llm usage for episode ${episodeId}`, async () => {
      const result = await this.client
        .from('llm_usage_events')
        .select('*')
        .eq('user_id', userId)
        .eq('episode_id', episodeId)
        .order('created_at', { ascending: true });
      if (result.error) {
        throw result.error;
      }
      const rows = (result.data as LlmUsageEventRow[] | null) ?? [];
      return rows.map((row) => this.fromRow(row));
    });
  }

  async listByTopic(userId: string, topicId: string): Promise<LlmUsageRecord[]> {
    return handleSupabaseErrors(this.logger, `list llm usage for topic ${topicId}`, async () => {
      const result = await this.client
        .from('llm_usage_events')
        .select('*')
        .eq('user_id', userId)
        .eq('topic_id', topicId)
        .order('created_at', { ascending: true });
      if (result.error) {
        throw result.error;
      }
      const rows = (result.data as LlmUsageEventRow[] | null) ?? [];
      return rows.map((row) => this.fromRow(row));
    });
  }

  private toRow(record: LlmUsageRecord): Omit<LlmUsageEventRow, 'id' | 'created_at'> {
    return {
      user_id: record.userId,
      episode_id: record.episodeId ?? null,
      topic_id: record.topicId ?? null,
      segment_id: record.segmentId ?? null,
      flow: record.flow ?? null,
      operation: record.operation,
      provider: record.provider ?? null,
      model: record.model ?? null,
      prompt_tokens: record.promptTokens ?? null,
      completion_tokens: record.completionTokens ?? null,
      total_tokens: record.totalTokens ?? null,
      cost_usd: record.costUsd ?? null,
      usage: record.usage ?? null,
    };
  }

  private fromRow(row: LlmUsageEventRow): LlmUsageRecord {
    return {
      userId: row.user_id,
      episodeId: row.episode_id ?? undefined,
      topicId: row.topic_id ?? undefined,
      segmentId: row.segment_id ?? undefined,
      flow: row.flow ?? undefined,
      operation: row.operation,
      provider: row.provider ?? undefined,
      model: row.model ?? undefined,
      promptTokens: row.prompt_tokens ?? undefined,
      completionTokens: row.completion_tokens ?? undefined,
      totalTokens: row.total_tokens ?? undefined,
      costUsd: row.cost_usd ?? null,
      usage: row.usage ?? undefined,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
    };
  }
}
