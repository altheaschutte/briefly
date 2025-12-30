import { EpisodeSegment, EpisodeSource } from '../domain/types';
import { TopicQueryPlan } from './llm.types';

export interface EpisodeMetadata {
  title: string;
  showNotes: string;
  description: string;
}

export interface LlmProvider {
  generateTopicQueries(topic: string, previousQueries: string[]): Promise<TopicQueryPlan>;
  generateSegmentScript(
    title: string,
    findings: string,
    sources: EpisodeSource[],
    targetDurationMinutes?: number,
    instruction?: string,
  ): Promise<string>;
  generateCoverMotif(title: string, topics?: string[]): Promise<string>;
  generateEpisodeMetadata(script: string, segments: EpisodeSegment[]): Promise<EpisodeMetadata>;
  extractTopicBriefs(transcript: string): Promise<string[]>;
  generateSeedTopics(userInsight: string): Promise<string[]>;
}
