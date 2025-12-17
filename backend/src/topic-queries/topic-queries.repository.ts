import { TopicQuery } from '../domain/types';
import { PerplexityCitation } from '../perplexity/perplexity.service';

export const TOPIC_QUERIES_REPOSITORY = 'TOPIC_QUERIES_REPOSITORY';

export interface TopicQueryCreateInput {
  topicId: string;
  episodeId: string;
  query: string;
  answer: string;
  citations: string[];
  citationMetadata?: PerplexityCitation[];
  orderIndex: number;
  intent?: import('../llm/llm.types').TopicIntent;
}

export interface TopicQueriesRepository {
  listByTopic(userId: string, topicId: string): Promise<TopicQuery[]>;
  listByEpisode(userId: string, episodeId: string): Promise<TopicQuery[]>;
  createMany(userId: string, inputs: TopicQueryCreateInput[]): Promise<TopicQuery[]>;
}
