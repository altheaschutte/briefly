import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { v4 as uuid } from 'uuid';
import { TopicsService } from '../topics/topics.service';
import { EpisodesService } from './episodes.service';
import { LlmService } from '../llm/llm.service';
import { PerplexityService } from '../perplexity/perplexity.service';
import { TtsService } from '../tts/tts.service';
import { Episode, EpisodeSegment, EpisodeSource, TopicQuery } from '../domain/types';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { EpisodeSourcesService } from './episode-sources.service';
import { TopicQueriesService } from '../topic-queries/topic-queries.service';
import { TopicQueryCreateInput } from '../topic-queries/topic-queries.repository';
import { CoverImageService } from './cover-image.service';

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
  ) {}

  async process(job: Job<{ episodeId: string; userId: string }>): Promise<void> {
    const { episodeId, userId } = job.data;
    try {
      const episode = await this.episodesService.getEpisode(userId, episodeId);
      const targetDuration = episode.targetDurationMinutes;
      await this.markEpisodeStatus(userId, episodeId, 'rewriting_queries');
      const topics = (await this.topicsService.listTopics(userId))
        .filter((t) => t.isActive)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      if (!topics.length) {
        throw new Error('No active topics configured for user');
      }
      const perSegmentTargetMinutes = Math.max(1, Math.round(targetDuration / topics.length));

      await this.markEpisodeStatus(userId, episodeId, 'retrieving_content');
      const segments: EpisodeSegment[] = [];
      const sources: EpisodeSource[] = [];
      let cumulativeStartSeconds = 0;
      const voiceA = process.env.TTS_VOICE_A || 'abRFZIdN4pvo8ZPmGxHP';
      const voiceB = process.env.TTS_VOICE_B || '5GZaeOOG7yqLdoTRsaa6';

      for (const [index, topic] of topics.entries()) {
        const previousQueries = await this.topicQueriesService.listByTopic(userId, topic.id);
        const suggestedQueries = await this.llmService.generateTopicQueries(
          topic.originalText,
          previousQueries.map((q) => q.query),
        );
        const freshQueries = this.selectFreshQueries(suggestedQueries, previousQueries);
        const fallbackQueries = this.selectFreshQueries([topic.originalText], previousQueries);
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
          });
        }

        const savedQueries = await this.topicQueriesService.createMany(userId, queryResults);
        const segmentSources = this.buildEpisodeSources(savedQueries, episodeId);
        const segmentContent = this.buildSegmentContent(topic.originalText, savedQueries);
        const segmentScript = await this.llmService.generateSegmentScript(
          topic.originalText,
          segmentContent,
          segmentSources,
          perSegmentTargetMinutes,
        );
        const segmentTtsResult = await this.ttsService.synthesize(segmentScript, { voiceA, voiceB });
        const segmentAudioUrl = segmentTtsResult.audioUrl ?? segmentTtsResult.storageKey;
        const segmentDurationSeconds = segmentTtsResult.durationSeconds ?? this.estimateDurationSeconds(segmentScript);
        const segmentStartSeconds = cumulativeStartSeconds;
        cumulativeStartSeconds += segmentDurationSeconds;

        segments.push({
          id: uuid(),
          episodeId,
          orderIndex: index,
          title: topic.originalText,
          rawContent: segmentContent,
          rawSources: segmentSources,
          script: segmentScript,
          audioUrl: segmentAudioUrl,
          startTimeSeconds: segmentStartSeconds,
          durationSeconds: segmentDurationSeconds,
        });
        sources.push(...segmentSources);
      }

      this.store.setSegments(episodeId, segments);
      await this.episodeSourcesService.replaceSources(episodeId, sources);

      await this.markEpisodeStatus(userId, episodeId, 'generating_script');
      const fullScript = this.combineSegmentScripts(segments);

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
      const ttsPromise = this.ttsService.synthesize(fullScript, { voiceA, voiceB, storageKey: audioKey });
      const [ttsResult, coverResult] = await Promise.all([ttsPromise, coverPromise]);
      const audioUrl = ttsResult.audioUrl ?? ttsResult.storageKey;
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

  private selectFreshQueries(candidateQueries: string[], previousQueries: TopicQuery[]): string[] {
    const used = new Set(
      (previousQueries || []).map((q) => q.query.trim().toLowerCase()).filter((q) => q.length > 0),
    );
    const seen = new Set<string>();
    const fresh: string[] = [];

    for (const candidate of candidateQueries || []) {
      const normalized = candidate.trim();
      if (!normalized) {
        continue;
      }
      const key = normalized.toLowerCase();
      if (used.has(key) || seen.has(key)) {
        continue;
      }
      seen.add(key);
      fresh.push(normalized);
    }
    return fresh;
  }

  private async markEpisodeStatus(
    userId: string,
    episodeId: string,
    status: Episode['status'],
    extra?: Partial<Episode>,
  ) {
    await this.episodesService.updateEpisode(userId, episodeId, { status, ...extra });
  }

  private buildEpisodeSources(queries: TopicQuery[], episodeId: string): EpisodeSource[] {
    const seen = new Set<string>();
    const results: EpisodeSource[] = [];

    for (const query of queries || []) {
      for (const raw of query.citations || []) {
        const citation = (raw || '').trim();
        if (!citation) {
          continue;
        }
        const normalized = citation.toLowerCase();
        if (seen.has(normalized)) {
          continue;
        }
        seen.add(normalized);
        results.push({
          id: uuid(),
          episodeId,
          sourceTitle: citation,
          url: citation,
          type: 'perplexity_citation',
        });
      }
    }

    return results;
  }

  private buildSegmentContent(topicTitle: string, queries: TopicQuery[]): string {
    if (!queries.length) {
      return topicTitle;
    }
    const ordered = [...queries].sort((a, b) => a.orderIndex - b.orderIndex);
    return ordered
      .map((query, idx) => {
        const answer = query.answer?.trim() || 'No answer returned';
        return `Query ${idx + 1}: ${query.query}\nFindings: ${answer}`;
      })
      .join('\n\n');
  }

  private combineSegmentScripts(segments: EpisodeSegment[]): string {
    return segments
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((segment) => segment.script || segment.rawContent || segment.title || '')
      .filter((text) => text.trim().length > 0)
      .join('\n\n');
  }

  private estimateDurationSeconds(script: string): number {
    const words = (script || '').split(/\s+/).filter(Boolean).length;
    const seconds = words / 2.5; // ~150 wpm
    return Math.max(8, Math.round(seconds));
  }
}
