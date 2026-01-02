import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER_TOKEN } from './llm.constants';
import { LlmProvider } from './llm.provider';
import { EpisodeSegment, EpisodeSource } from '../domain/types';
import { EpisodeMetadata, SegmentDiveDeeperSeedDraft, SegmentScriptDraft, TopicMeta } from './llm.provider';
import { TopicQueryPlan } from './llm.types';

@Injectable()
export class LlmService implements LlmProvider {
  constructor(@Inject(LLM_PROVIDER_TOKEN) private readonly provider: LlmProvider) {}

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
  ): Promise<TopicQueryPlan> {
    return this.provider.generateTopicQueries(topic, previousQueries, options);
  }

  generateSegmentScript(
    title: string,
    findings: string,
    sources: EpisodeSource[],
    targetDurationMinutes?: number,
    instruction?: string,
  ): Promise<SegmentScriptDraft> {
    return this.provider.generateSegmentScript(title, findings, sources, targetDurationMinutes, instruction);
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

  generateTopicMeta(topicText: string): Promise<TopicMeta> {
    return this.provider.generateTopicMeta(topicText);
  }

  extractTopicBriefs(transcript: string): Promise<string[]> {
    return this.provider.extractTopicBriefs(transcript);
  }

  generateSegmentDiveDeeperSeed(input: {
    parentTopicText: string;
    segmentScript: string;
    segmentSources: EpisodeSource[];
    parentQueryTexts: string[];
  }): Promise<SegmentDiveDeeperSeedDraft> {
    return this.provider.generateSegmentDiveDeeperSeed(input);
  }
}
