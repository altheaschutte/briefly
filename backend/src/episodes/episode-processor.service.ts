import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { v4 as uuid } from 'uuid';
import { TopicsService } from '../topics/topics.service';
import { EpisodesService } from './episodes.service';
import { LlmService } from '../llm/llm.service';
import { PerplexityService } from '../perplexity/perplexity.service';
import { TtsService } from '../tts/tts.service';
import { Episode, EpisodeSegment, EpisodeSource } from '../domain/types';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { EpisodeSourcesService } from './episode-sources.service';
import { TopicQueriesService } from '../topic-queries/topic-queries.service';
import { TopicQueryCreateInput } from '../topic-queries/topic-queries.repository';
import { CoverImageService } from './cover-image.service';
import { getDefaultVoices } from '../tts/voice-config';
import {
  buildEpisodeSources,
  buildSegmentContent,
  combineDialogueScripts,
  estimateDurationSeconds,
  renderDialogueScript,
  selectFreshQueries,
} from './episode-script.utils';

@Injectable()
export class EpisodeProcessorService {
  private readonly logger = new Logger(EpisodeProcessorService.name);

  constructor(
    private readonly topicsService: TopicsService,
    private readonly episodesService: EpisodesService,
    private readonly llmService: LlmService,
    private readonly topicQueriesService: TopicQueriesService,
    private readonly perplexityService: PerplexityService,
    private readonly ttsService: TtsService,
    private readonly episodeSourcesService: EpisodeSourcesService,
    private readonly store: InMemoryStoreService,
    private readonly coverImageService: CoverImageService,
    private readonly configService: ConfigService,
  ) {}

  async process(job: Job<{ episodeId: string; userId: string }>): Promise<void> {
    const { episodeId, userId } = job.data;
    try {
      const episode = await this.episodesService.getEpisode(userId, episodeId);
      const targetDuration = episode.targetDurationMinutes;
      await this.markEpisodeStatus(userId, episodeId, 'rewriting_queries');
      const activeTopics = (await this.topicsService.listTopics(userId))
        .filter((t) => t.isActive)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      if (!activeTopics.length) {
        throw new Error('No active topics configured for user');
      }
      const testMode = this.isTestModeEnabled();
      const topics = testMode ? activeTopics.slice(0, 1) : activeTopics;
      if (testMode && activeTopics.length > topics.length) {
        this.logger.log(`API_TEST_MODE enabled: limiting episode ${episodeId} to ${topics.length} segment(s)`);
      }
      const perSegmentTargetMinutes = Math.max(1, Math.round(targetDuration / activeTopics.length));

      await this.markEpisodeStatus(userId, episodeId, 'retrieving_content');
      const segments: EpisodeSegment[] = [];
      const sources: EpisodeSource[] = [];
      let cumulativeStartSeconds = 0;
      const { voiceA, voiceB } = getDefaultVoices(this.configService);

      for (const [index, topic] of topics.entries()) {
        const previousQueries = await this.topicQueriesService.listByTopic(userId, topic.id);
        const topicPlan = await this.llmService.generateTopicQueries(
          topic.originalText,
          previousQueries.map((q) => q.query),
        );
        const topicIntent = topicPlan.intent;
        const freshQueries = selectFreshQueries(topicPlan.queries, previousQueries);
        const fallbackQueries = selectFreshQueries([topic.originalText], previousQueries);
        const plannedQueries = (freshQueries.length ? freshQueries : fallbackQueries).slice(0, 5);
        const queriesToRun = plannedQueries.length ? plannedQueries : [topic.originalText];

        const queryResults: TopicQueryCreateInput[] = [];
        for (const [orderIndex, queryText] of queriesToRun.entries()) {
          const perplexityResult = await this.perplexityService.search(queryText);
          queryResults.push({
            topicId: topic.id,
            episodeId,
            query: queryText,
            answer: perplexityResult.answer,
            citations: perplexityResult.citations || [],
            orderIndex,
            intent: topicIntent,
          });
        }

        const savedQueries = await this.topicQueriesService.createMany(userId, queryResults);
        const segmentSources = buildEpisodeSources(savedQueries, episodeId);
        const segmentContent = buildSegmentContent(topic.originalText, savedQueries);
        let segmentDialogue = await this.llmService.generateSegmentScript(
          topic.originalText,
          segmentContent,
          segmentSources,
          topicIntent,
          perSegmentTargetMinutes,
        );
        try {
          segmentDialogue = await this.llmService.enhanceSegmentDialogueForElevenV3(segmentDialogue);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Dialogue enhancement failed for topic ${topic.id}: ${message}`);
        }
        const segmentScriptText = renderDialogueScript(segmentDialogue);
        const segmentTtsResult = await this.ttsService.synthesize(segmentDialogue, { voiceA, voiceB });
        const segmentAudioUrl = segmentTtsResult.storageKey ?? segmentTtsResult.audioUrl;
        const segmentDurationSeconds =
          segmentTtsResult.durationSeconds ?? estimateDurationSeconds(segmentScriptText);
        const segmentStartSeconds = cumulativeStartSeconds;
        cumulativeStartSeconds += segmentDurationSeconds;

        segments.push({
          id: uuid(),
          episodeId,
          orderIndex: index,
          title: topic.originalText,
          intent: segmentDialogue.intent || topicIntent,
          rawContent: segmentContent,
          rawSources: segmentSources,
          script: segmentScriptText,
          dialogueScript: segmentDialogue,
          audioUrl: segmentAudioUrl,
          startTimeSeconds: segmentStartSeconds,
          durationSeconds: segmentDurationSeconds,
        });
        sources.push(...segmentSources);
      }

      this.store.setSegments(episodeId, segments);
      await this.episodeSourcesService.replaceSources(episodeId, sources);

      await this.markEpisodeStatus(userId, episodeId, 'generating_script');
      const fullDialogue = combineDialogueScripts(segments);
      const fullScript = renderDialogueScript(fullDialogue);

      await this.markEpisodeStatus(userId, episodeId, 'generating_audio');
      const metadata = await this.llmService.generateEpisodeMetadata(fullScript, segments);
      const coverPrompt = this.coverImageService.buildPrompt(metadata.title, segments);
      const coverPromise = this.coverImageService
        .generateCoverImage(userId, episodeId, coverPrompt)
        .then((result) => ({ ...result, prompt: coverPrompt }))
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Cover image generation failed for episode ${episodeId}: ${message}`);
          return { prompt: coverPrompt } as { prompt: string; imageUrl?: string; storageKey?: string };
        });
      const audioKey = `${userId}/${episodeId}.mp3`;
      const ttsPromise = this.ttsService.synthesize(fullDialogue, { voiceA, voiceB, storageKey: audioKey });
      const [ttsResult, coverResult] = await Promise.all([ttsPromise, coverPromise]);
      const audioUrl = ttsResult.storageKey ?? ttsResult.audioUrl;
      const episodeDurationSeconds = ttsResult.durationSeconds ?? cumulativeStartSeconds;

      await this.markEpisodeStatus(userId, episodeId, 'ready', {
        transcript: fullScript,
        scriptPrompt: 'Per-segment scripts concatenated in topic order.',
        showNotes: metadata.showNotes,
        title: metadata.title,
        description: metadata.description,
        audioUrl: audioUrl,
        durationSeconds: episodeDurationSeconds,
        coverImageUrl: coverResult.imageUrl,
        coverPrompt: coverResult.prompt,
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

  private isTestModeEnabled(): boolean {
    const value = this.configService.get('API_TEST_MODE');
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value !== 'string') {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }
}
