import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { v4 as uuid } from 'uuid';
import { TopicsService } from '../topics/topics.service';
import { EpisodesService } from './episodes.service';
import { LlmService } from '../llm/llm.service';
import { PerplexityService } from '../perplexity/perplexity.service';
import { TtsService } from '../tts/tts.service';
import { Episode, EpisodeSegment, EpisodeSource } from '../domain/types';
import { InMemoryStoreService } from '../common/in-memory-store.service';

@Injectable()
export class EpisodeProcessorService {
  private readonly logger = new Logger(EpisodeProcessorService.name);

  constructor(
    private readonly topicsService: TopicsService,
    private readonly episodesService: EpisodesService,
    private readonly llmService: LlmService,
    private readonly perplexityService: PerplexityService,
    private readonly ttsService: TtsService,
    private readonly store: InMemoryStoreService,
  ) {}

  async process(job: Job<{ episodeId: string; userId: string }>): Promise<void> {
    const { episodeId, userId } = job.data;
    try {
      const episode = await this.episodesService.getEpisode(userId, episodeId);
      const targetDuration = episode.targetDurationMinutes;
      await this.markEpisodeStatus(userId, episodeId, 'rewriting_queries');
      const topics = (await this.topicsService.listTopics(userId)).filter((t) => t.isActive);
      if (!topics.length) {
        throw new Error('No active topics configured for user');
      }

      const rewrittenTopics = await Promise.all(
        topics.map(async (topic) => {
          if (topic.rewrittenQuery) {
            return topic;
          }
          const rewrittenQuery = await this.llmService.rewriteTopic(topic.originalText);
          const updated = await this.topicsService.setRewrittenQuery(userId, topic.id, rewrittenQuery);
          return updated;
        }),
      );

      await this.markEpisodeStatus(userId, episodeId, 'retrieving_content');
      const segments: EpisodeSegment[] = [];
      const sources: EpisodeSource[] = [];

      for (const [index, topic] of rewrittenTopics.entries()) {
        if (!topic.rewrittenQuery) {
          continue;
        }
        const perplexityResult = await this.perplexityService.search(topic.rewrittenQuery);
        segments.push({
          id: uuid(),
          episodeId,
          orderIndex: index,
          title: topic.originalText,
          rawContent: perplexityResult.answer,
          rawSources: perplexityResult.citations,
        });
        perplexityResult.citations.forEach((citation) => {
          sources.push({
            id: uuid(),
            episodeId,
            sourceTitle: citation,
            url: citation,
          });
        });
      }

      this.store.setSegments(episodeId, segments);
      this.store.setSources(episodeId, sources);

      await this.markEpisodeStatus(userId, episodeId, 'generating_script');
      const { script, prompt } = await this.llmService.generateScript(segments, targetDuration);

      await this.markEpisodeStatus(userId, episodeId, 'generating_audio');
      const voiceA = process.env.TTS_VOICE_A || 'abRFZIdN4pvo8ZPmGxHP';
      const voiceB = process.env.TTS_VOICE_B || '5GZaeOOG7yqLdoTRsaa6';
      const ttsResult = await this.ttsService.synthesize(script, { voiceA, voiceB });
      const audioKey = ttsResult.storageKey ?? ttsResult.audioUrl;

      await this.markEpisodeStatus(userId, episodeId, 'ready', {
        transcript: script,
        scriptPrompt: prompt,
        audioUrl: audioKey,
      });
    } catch (error: any) {
      const axiosData = error?.response?.data ? ` | data=${JSON.stringify(error.response.data)}` : '';
      this.logger.error(`Failed to process episode ${episodeId}: ${error?.message || error}${axiosData}`);
      await this.markEpisodeStatus(userId, episodeId, 'failed', { errorMessage: error?.message || 'Unknown error' });
      throw error;
    }
  }

  private async markEpisodeStatus(
    userId: string,
    episodeId: string,
    status: Episode['status'],
    extra?: Partial<Episode>,
  ) {
    await this.episodesService.updateEpisode(userId, episodeId, { status, ...extra });
  }
}
