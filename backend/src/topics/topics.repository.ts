import { Topic } from '../domain/types';

export const TOPICS_REPOSITORY = 'TOPICS_REPOSITORY';

export interface TopicUpdateInput {
  originalText?: string;
  isActive?: boolean;
  orderIndex?: number;
}

export interface TopicListFilter {
  isActive?: boolean;
}

export interface TopicsRepository {
  listByUser(userId: string, filter?: TopicListFilter): Promise<Topic[]>;
  getById(userId: string, topicId: string): Promise<Topic | undefined>;
  create(
    userId: string,
    originalText: string,
    options?: { isSeed?: boolean; isActive?: boolean },
  ): Promise<Topic>;
  update(userId: string, topicId: string, updates: TopicUpdateInput): Promise<Topic | undefined>;
}
