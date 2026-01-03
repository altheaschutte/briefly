import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';
import { Topic } from '../domain/types';
import { handleSupabaseErrors } from '../common/supabase.util';
import { TopicListFilter, TopicUpdateInput, TopicsRepository } from './topics.repository';
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

  async listByUser(userId: string, filter?: TopicListFilter): Promise<Topic[]> {
    return handleSupabaseErrors(this.logger, `list topics for user ${userId}`, async () => {
      let query = this.client
        .from('topics')
        .select('*')
        .eq('user_id', userId);

      if (filter?.segmentDiveDeeperSeedId) {
        query = query.eq('segment_dive_deeper_seed_id', filter.segmentDiveDeeperSeedId);
      } else if (!filter?.includeSystemGenerated) {
        query = query.is('segment_dive_deeper_seed_id', null);
      }
      if (filter?.isActive !== undefined) {
        query = query.eq('is_active', filter.isActive);
      }

      const { data, error } = await query
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        this.logger.error(`Failed to list topics for user ${userId}: ${error.message}`);
        throw error;
      }

      const rows = (data as TopicRow[] | null) ?? [];
      return rows.map((row) => this.mapRow(row));
    });
  }

  async getById(userId: string, topicId: string): Promise<Topic | undefined> {
    return handleSupabaseErrors(this.logger, `fetch topic ${topicId} for user ${userId}`, async () => {
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
    });
  }

  async create(
    userId: string,
    originalText: string,
    options?: {
      title?: string | null;
      isSeed?: boolean;
      isActive?: boolean;
      segmentDiveDeeperSeedId?: string | null;
      contextBundle?: any | null;
    },
  ): Promise<Topic> {
    return handleSupabaseErrors(this.logger, `create topic for user ${userId}`, async () => {
      const now = new Date().toISOString();
      const nextOrderIndex = await this.getNextOrderIndex(userId);
      const payload: TopicRow = {
        id: uuid(),
        user_id: userId,
        title: options?.title ?? null,
        original_text: originalText,
        classification_id: null,
        classification_short_label: null,
        order_index: nextOrderIndex,
        is_active: options?.isActive ?? true,
        is_seed: options?.isSeed ?? false,
        segment_dive_deeper_seed_id: options?.segmentDiveDeeperSeedId ?? null,
        context_bundle: options?.contextBundle ?? null,
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
    });
  }

  async update(userId: string, topicId: string, updates: TopicUpdateInput): Promise<Topic | undefined> {
    return handleSupabaseErrors(this.logger, `update topic ${topicId} for user ${userId}`, async () => {
      const now = new Date().toISOString();
      const payload: Partial<TopicRow> = {
        updated_at: now,
      };

      if (updates.originalText !== undefined) {
        payload.original_text = updates.originalText;
      }
      if (updates.title !== undefined) {
        payload.title = updates.title;
      }
      if (updates.classificationId !== undefined) {
        payload.classification_id = updates.classificationId;
      }
      if (updates.classificationShortLabel !== undefined) {
        payload.classification_short_label = updates.classificationShortLabel;
      }
      if (updates.isActive !== undefined) {
        payload.is_active = updates.isActive;
      }
      if (updates.orderIndex !== undefined) {
        payload.order_index = updates.orderIndex;
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
    });
  }

  private mapRow(row: TopicRow): Topic {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title ?? undefined,
      originalText: row.original_text,
      classificationId: row.classification_id ?? undefined,
      classificationShortLabel: row.classification_short_label ?? undefined,
      orderIndex: row.order_index,
      isActive: row.is_active,
      isSeed: row.is_seed,
      segmentDiveDeeperSeedId: row.segment_dive_deeper_seed_id ?? undefined,
      contextBundle: row.context_bundle ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private async getNextOrderIndex(userId: string): Promise<number> {
    const { data, error } = await this.client
      .from('topics')
      .select('order_index')
      .eq('user_id', userId)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to compute next order_index for user ${userId}: ${error.message}`);
      throw error;
    }

    const currentMax = (data as TopicRow | null)?.order_index;
    return currentMax !== undefined && currentMax !== null ? currentMax + 1 : 0;
  }
}
