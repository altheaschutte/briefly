import { Topic } from '../domain/types';

export const TOPICS_REPOSITORY = 'TOPICS_REPOSITORY';

export interface TopicUpdateInput {
  originalText?: string;
  isActive?: boolean;
  rewrittenQuery?: string;
}

export interface TopicsRepository {
  listByUser(userId: string): Promise<Topic[]>;
  getById(userId: string, topicId: string): Promise<Topic | undefined>;
  create(userId: string, originalText: string): Promise<Topic>;
  update(userId: string, topicId: string, updates: TopicUpdateInput): Promise<Topic | undefined>;
}
