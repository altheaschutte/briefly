import { EpisodeSegment, EpisodeSource } from '../domain/types';
import { TopicQueryPlan } from './llm.types';

export interface EpisodeMetadata {
  title: string;
  showNotes: string;
  description: string;
}

export interface SegmentScriptDraft {
  title: string;
  script: string;
}

export interface SegmentDiveDeeperSeedDraft {
  title: string;
  angle: string;
  focusClaims: string[];
  seedQueries: string[];
  contextBundle: any;
}

export interface TopicMeta {
  title: string;
  classificationId: string;
  classificationShortLabel: string;
}

export interface LlmProvider {
  generateTopicQueries(
    topic: string,
    previousQueries: string[],
    options?: {
      mode?: 'standard' | 'dive_deeper';
      seedQueries?: string[];
      focusClaims?: string[];
      angle?: string;
      contextBundle?: any;
      parentQueryTexts?: string[];
    },
  ): Promise<TopicQueryPlan>;
  generateSegmentScript(
    title: string,
    findings: string,
    sources: EpisodeSource[],
    targetDurationMinutes?: number,
    instruction?: string,
  ): Promise<SegmentScriptDraft>;
  generateCoverMotif(title: string, topics?: string[]): Promise<string>;
  generateEpisodeMetadata(script: string, segments: EpisodeSegment[]): Promise<EpisodeMetadata>;
  extractTopicBriefs(transcript: string): Promise<string[]>;
  generateSeedTopics(userInsight: string): Promise<string[]>;
  generateTopicMeta(topicText: string): Promise<TopicMeta>;
  generateSegmentDiveDeeperSeed(input: {
    parentTopicText: string;
    segmentScript: string;
    segmentSources: EpisodeSource[];
    parentQueryTexts: string[];
  }): Promise<SegmentDiveDeeperSeedDraft>;
}
