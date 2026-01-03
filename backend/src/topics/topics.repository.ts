import { Topic } from '../domain/types';

export const TOPICS_REPOSITORY = 'TOPICS_REPOSITORY';

export interface TopicUpdateInput {
  title?: string | null;
  originalText?: string;
  classificationId?: string | null;
  classificationShortLabel?: string | null;
  isActive?: boolean;
  orderIndex?: number;
}

export interface TopicListFilter {
  isActive?: boolean;
  includeSystemGenerated?: boolean;
  segmentDiveDeeperSeedId?: string;
}

export interface TopicsRepository {
  listByUser(userId: string, filter?: TopicListFilter): Promise<Topic[]>;
  getById(userId: string, topicId: string): Promise<Topic | undefined>;
  create(
    userId: string,
    originalText: string,
    options?: {
      title?: string | null;
      isSeed?: boolean;
      isActive?: boolean;
      segmentDiveDeeperSeedId?: string | null;
      contextBundle?: any | null;
    },
  ): Promise<Topic>;
  update(userId: string, topicId: string, updates: TopicUpdateInput): Promise<Topic | undefined>;
}
