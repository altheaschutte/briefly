import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';
import { TopicQuery } from '../domain/types';
import { TopicQueriesRepository, TopicQueryCreateInput } from './topic-queries.repository';
import { SupabaseDatabase, TopicQueryRow } from './topic-queries.supabase-types';

@Injectable()
export class SupabaseTopicQueriesRepository implements TopicQueriesRepository {
  private readonly client: SupabaseClient<SupabaseDatabase>;
  private readonly logger = new Logger(SupabaseTopicQueriesRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error(
        'Supabase URL and service role key are required for SupabaseTopicQueriesRepository',
      );
    }

    this.client = createClient<SupabaseDatabase>(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async listByTopic(userId: string, topicId: string): Promise<TopicQuery[]> {
    const { data, error } = await this.client
      .from('topic_queries')
      .select('*')
      .eq('user_id', userId)
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(
        `Failed to list topic queries for topic ${topicId} user ${userId}: ${error.message}`,
      );
      throw error;
    }
    const rows = (data as TopicQueryRow[] | null) ?? [];
    return rows.map((row) => this.mapRow(row));
  }

  async listByEpisode(userId: string, episodeId: string): Promise<TopicQuery[]> {
    const { data, error } = await this.client
      .from('topic_queries')
      .select('*')
      .eq('user_id', userId)
      .eq('episode_id', episodeId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(
        `Failed to list topic queries for episode ${episodeId} user ${userId}: ${error.message}`,
      );
      throw error;
    }
    const rows = (data as TopicQueryRow[] | null) ?? [];
    return rows.map((row) => this.mapRow(row));
  }

  async createMany(userId: string, inputs: TopicQueryCreateInput[]): Promise<TopicQuery[]> {
    const now = new Date().toISOString();
    const payload: TopicQueryRow[] = inputs.map((input) => ({
      id: uuid(),
      user_id: userId,
      topic_id: input.topicId,
      episode_id: input.episodeId,
      query: input.query,
      answer: input.answer,
      citations: input.citations ?? [],
      order_index: input.orderIndex,
      created_at: now,
      updated_at: now,
    }));

    const { data, error } = await this.client.from('topic_queries').insert(payload).select();

    if (error) {
      this.logger.error(`Failed to create topic queries for user ${userId}: ${error.message}`);
      throw error;
    }
    const rows = (data as TopicQueryRow[] | null) ?? [];
    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: TopicQueryRow): TopicQuery {
    const citations = Array.isArray(row.citations)
      ? row.citations.map((citation) => String(citation))
      : [];
    return {
      id: row.id,
      userId: row.user_id,
      topicId: row.topic_id,
      episodeId: row.episode_id,
      query: row.query,
      answer: row.answer ?? '',
      citations,
      orderIndex: row.order_index,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
