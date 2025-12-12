import { EpisodeSegment } from '../domain/types';

export interface ScriptGenerationResult {
  script: string;
  prompt: string;
  showNotes: string;
}

export interface LlmProvider {
  rewriteTopic(topic: string): Promise<string>;
  generateScript(segments: EpisodeSegment[], targetDurationMinutes?: number): Promise<ScriptGenerationResult>;
}
