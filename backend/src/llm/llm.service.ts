import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER_TOKEN } from './llm.constants';
import { LlmProvider, ScriptGenerationResult } from './llm.provider';
import { EpisodeSegment, EpisodeSource } from '../domain/types';
import { EpisodeMetadata } from './llm.provider';

@Injectable()
export class LlmService implements LlmProvider {
  constructor(@Inject(LLM_PROVIDER_TOKEN) private readonly provider: LlmProvider) {}

  generateTopicQueries(topic: string, previousQueries: string[]): Promise<string[]> {
    return this.provider.generateTopicQueries(topic, previousQueries);
  }

  generateSegmentScript(
    title: string,
    findings: string,
    sources: EpisodeSource[],
    targetDurationMinutes?: number,
  ): Promise<string> {
    return this.provider.generateSegmentScript(title, findings, sources, targetDurationMinutes);
  }

  generateEpisodeMetadata(script: string, segments: EpisodeSegment[]): Promise<EpisodeMetadata> {
    return this.provider.generateEpisodeMetadata(script, segments);
  }

  generateScript(segments: EpisodeSegment[], targetDurationMinutes?: number): Promise<ScriptGenerationResult> {
    return this.provider.generateScript(segments, targetDurationMinutes);
  }

  extractTopicBriefs(transcript: string): Promise<string[]> {
    return this.provider.extractTopicBriefs(transcript);
  }
}
