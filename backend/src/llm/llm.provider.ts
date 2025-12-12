import { EpisodeSegment, EpisodeSource } from '../domain/types';

export interface ScriptGenerationResult {
  script: string;
  prompt: string;
  showNotes: string;
}

export interface EpisodeMetadata {
  title: string;
  showNotes: string;
  description: string;
}

export interface LlmProvider {
  generateTopicQueries(topic: string, previousQueries: string[]): Promise<string[]>;
  generateSegmentScript(
    title: string,
    findings: string,
    sources: EpisodeSource[],
    targetDurationMinutes?: number,
  ): Promise<string>;
  generateEpisodeMetadata(script: string, segments: EpisodeSegment[]): Promise<EpisodeMetadata>;
  generateScript(segments: EpisodeSegment[], targetDurationMinutes?: number): Promise<ScriptGenerationResult>;
  extractTopicBriefs(transcript: string): Promise<string[]>;
}
