import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER_TOKEN } from './llm.constants';
import { LlmProvider } from './llm.provider';
import { EpisodeSegment, EpisodeSource } from '../domain/types';
import { EpisodeMetadata } from './llm.provider';
import { SegmentDialogueScript, TopicIntent, TopicQueryPlan } from './llm.types';

@Injectable()
export class LlmService implements LlmProvider {
  constructor(@Inject(LLM_PROVIDER_TOKEN) private readonly provider: LlmProvider) {}

  generateTopicQueries(topic: string, previousQueries: string[]): Promise<TopicQueryPlan> {
    return this.provider.generateTopicQueries(topic, previousQueries);
  }

  generateSegmentScript(
    title: string,
    findings: string,
    sources: EpisodeSource[],
    intent: TopicIntent,
    targetDurationMinutes?: number,
    instruction?: string,
  ): Promise<SegmentDialogueScript> {
    return this.provider.generateSegmentScript(title, findings, sources, intent, targetDurationMinutes, instruction);
  }

  generateEpisodeMetadata(script: string, segments: EpisodeSegment[]): Promise<EpisodeMetadata> {
    return this.provider.generateEpisodeMetadata(script, segments);
  }

  generateCoverMotif(title: string, topics?: string[]): Promise<string> {
    return this.provider.generateCoverMotif(title, topics);
  }

  generateSeedTopics(userInsight: string): Promise<string[]> {
    return this.provider.generateSeedTopics(userInsight);
  }

  enhanceSegmentDialogueForElevenV3(script: SegmentDialogueScript): Promise<SegmentDialogueScript> {
    return this.provider.enhanceSegmentDialogueForElevenV3(script);
  }

  extractTopicBriefs(transcript: string): Promise<string[]> {
    return this.provider.extractTopicBriefs(transcript);
  }
}
