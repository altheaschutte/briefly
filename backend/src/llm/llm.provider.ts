import { EpisodeSegment, EpisodeSource } from '../domain/types';
import { SegmentDialogueScript, TopicQueryPlan, TopicIntent } from './llm.types';

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
    intent: TopicIntent,
    targetDurationMinutes?: number,
  ): Promise<SegmentDialogueScript>;
  generateCoverMotif(title: string, topics?: string[]): Promise<string>;
  enhanceSegmentDialogueForElevenV3(script: SegmentDialogueScript): Promise<SegmentDialogueScript>;
  generateEpisodeMetadata(script: string, segments: EpisodeSegment[]): Promise<EpisodeMetadata>;
  extractTopicBriefs(transcript: string): Promise<string[]>;
}
