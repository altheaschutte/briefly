import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER_TOKEN } from './llm.constants';
import { LlmProvider, ScriptGenerationResult } from './llm.provider';
import { EpisodeSegment } from '../domain/types';

@Injectable()
export class LlmService implements LlmProvider {
  constructor(@Inject(LLM_PROVIDER_TOKEN) private readonly provider: LlmProvider) {}

  generateTopicQueries(topic: string, previousQueries: string[]): Promise<string[]> {
    return this.provider.generateTopicQueries(topic, previousQueries);
  }

  generateScript(segments: EpisodeSegment[], targetDurationMinutes?: number): Promise<ScriptGenerationResult> {
    return this.provider.generateScript(segments, targetDurationMinutes);
  }

  extractTopicBriefs(transcript: string): Promise<string[]> {
    return this.provider.extractTopicBriefs(transcript);
  }
}
