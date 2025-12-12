import { EpisodeSegment } from '../domain/types';

export interface ScriptGenerationResult {
  script: string;
  prompt: string;
  showNotes: string;
}

export interface LlmProvider {
  generateTopicQueries(topic: string, previousQueries: string[]): Promise<string[]>;
  generateScript(segments: EpisodeSegment[], targetDurationMinutes?: number): Promise<ScriptGenerationResult>;
  extractTopicBriefs(transcript: string): Promise<string[]>;
}
