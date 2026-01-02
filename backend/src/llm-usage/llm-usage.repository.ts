import { LlmUsageRecord } from './llm-usage.types';

export const LLM_USAGE_REPOSITORY = 'LLM_USAGE_REPOSITORY';

export interface LlmUsageRepository {
  create(record: LlmUsageRecord): Promise<void>;
  listByEpisode(userId: string, episodeId: string): Promise<LlmUsageRecord[]>;
  listByTopic(userId: string, topicId: string): Promise<LlmUsageRecord[]>;
}

