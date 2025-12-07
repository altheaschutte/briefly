import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';
import { Topic } from '../domain/types';
import { TopicUpdateInput, TopicsRepository } from './topics.repository';
import { SupabaseDatabase, TopicRow } from './topics.supabase-types';

@Injectable()
export class SupabaseTopicsRepository implements TopicsRepository {
  private readonly client: SupabaseClient<SupabaseDatabase>;
  private readonly logger = new Logger(SupabaseTopicsRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase URL and service role key are required for SupabaseTopicsRepository');
    }

    this.client = createClient<SupabaseDatabase>(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async listByUser(userId: string): Promise<Topic[]> {
    const { data, error } = await this.client
      .from('topics')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Failed to list topics for user ${userId}: ${error.message}`);
      throw error;
    }

    const rows = (data as TopicRow[] | null) ?? [];
    return rows.map((row) => this.mapRow(row));
  }

  async getById(userId: string, topicId: string): Promise<Topic | undefined> {
    const { data, error } = await this.client
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return undefined;
      }
      this.logger.error(`Failed to fetch topic ${topicId} for user ${userId}: ${error.message}`);
      throw error;
    }

    if (!data) {
      return undefined;
    }

    return this.mapRow(data as TopicRow);
  }

  async create(userId: string, originalText: string): Promise<Topic> {
    const now = new Date().toISOString();
    const payload: TopicRow = {
      id: uuid(),
      user_id: userId,
      original_text: originalText,
      rewritten_query: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await this.client.from('topics').insert(payload).select().maybeSingle();

    if (error) {
      this.logger.error(`Failed to create topic for user ${userId}: ${error.message}`);
      throw error;
    }

    if (!data) {
      throw new Error('Supabase did not return a topic row after insert');
    }

    return this.mapRow(data as TopicRow);
  }

  async update(userId: string, topicId: string, updates: TopicUpdateInput): Promise<Topic | undefined> {
    const now = new Date().toISOString();
    const payload: Partial<TopicRow> = {
      updated_at: now,
    };

    if (updates.originalText !== undefined) {
      payload.original_text = updates.originalText;
    }
    if (updates.isActive !== undefined) {
      payload.is_active = updates.isActive;
    }
    if (updates.rewrittenQuery !== undefined) {
      payload.rewritten_query = updates.rewrittenQuery ?? null;
    }

    const { data, error } = await this.client
      .from('topics')
      .update(payload)
      .eq('id', topicId)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return undefined;
      }
      this.logger.error(`Failed to update topic ${topicId} for user ${userId}: ${error.message}`);
      throw error;
    }

    if (!data) {
      return undefined;
    }

    return this.mapRow(data as TopicRow);
  }

  private mapRow(row: TopicRow): Topic {
    return {
      id: row.id,
      userId: row.user_id,
      originalText: row.original_text,
      rewrittenQuery: row.rewritten_query ?? undefined,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
