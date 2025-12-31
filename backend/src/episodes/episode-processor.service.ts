import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { v4 as uuid } from 'uuid';
import { promises as fs } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import ffmpeg from 'ffmpeg-static';
import { parseBuffer } from 'music-metadata';
import { TopicsService } from '../topics/topics.service';
import { EpisodesService } from './episodes.service';
import { LlmService } from '../llm/llm.service';
import { PerplexityService } from '../perplexity/perplexity.service';
import { TtsService } from '../tts/tts.service';
import { Episode, EpisodeSegment } from '../domain/types';
import { EpisodeSourcesService } from './episode-sources.service';
import { TopicQueriesService } from '../topic-queries/topic-queries.service';
import { TopicQueryCreateInput } from '../topic-queries/topic-queries.repository';
import { CoverImageService } from './cover-image.service';
import { getDefaultVoices } from '../tts/voice-config';
import { EntitlementsService } from '../billing/entitlements.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildEpisodeSources,
  buildSegmentContent,
  combineDialogueScripts,
  coerceTextToDialogue,
  estimateDurationSeconds,
  renderDialogueScript,
  selectFreshQueries,
} from './episode-script.utils';
import { EpisodeSegmentsService } from './episode-segments.service';
import { SegmentDialogueScript } from '../llm/llm.types';
import { SegmentDiveDeeperSeedsService } from './segment-dive-deeper-seeds.service';

@Injectable()
export class EpisodeProcessorService {
  private readonly logger = new Logger(EpisodeProcessorService.name);
  private readonly segmentGapSeconds = 2;

  constructor(
    private readonly topicsService: TopicsService,
    private readonly episodesService: EpisodesService,
    private readonly llmService: LlmService,
    private readonly topicQueriesService: TopicQueriesService,
    private readonly perplexityService: PerplexityService,
    private readonly ttsService: TtsService,
    private readonly episodeSegmentsService: EpisodeSegmentsService,
    private readonly episodeSourcesService: EpisodeSourcesService,
    private readonly segmentDiveDeeperSeedsService: SegmentDiveDeeperSeedsService,
    private readonly coverImageService: CoverImageService,
    private readonly configService: ConfigService,
    private readonly entitlementsService: EntitlementsService,
    private readonly storageService: StorageService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async process(job: Job<{ episodeId: string; userId: string }>): Promise<void> {
    const { episodeId, userId } = job.data;
    let stage = 'init';
    try {
      stage = 'get_episode';
      const episode = await this.episodesService.getEpisode(userId, episodeId);
      const targetDuration = episode.targetDurationMinutes;
      stage = 'status:rewriting_queries';
      await this.markEpisodeStatus(userId, episodeId, 'rewriting_queries');
      stage = 'list_topics';
      const activeTopics = episode.diveDeeperSeedId
        ? [await this.topicsService.getDiveDeeperTopicForSeed(userId, episode.diveDeeperSeedId)]
        : (await this.topicsService.listTopics(userId, { isActive: true })).sort((a, b) => a.orderIndex - b.orderIndex);
      if (!activeTopics.length) {
        throw new Error('No active topics configured for user');
      }
      const testMode = this.isTestModeEnabled();
      const topics = testMode ? activeTopics.slice(0, 1) : activeTopics;
      if (testMode && activeTopics.length > topics.length) {
        this.logger.log(`API_TEST_MODE enabled: limiting episode ${episodeId} to ${topics.length} segment(s)`);
      }
      const perSegmentTargetMinutes = Math.max(1, Math.round(targetDuration / activeTopics.length));

      stage = 'status:retrieving_content';
      await this.markEpisodeStatus(userId, episodeId, 'retrieving_content');
      const segments: EpisodeSegment[] = [];
      let cumulativeStartSeconds = 0;
      const { voiceA, voiceB } = getDefaultVoices(this.configService);
      let previousSegmentTitle: string | null = null;

      for (const [index, topic] of topics.entries()) {
        stage = `topic:${index}:previous_queries`;
        const previousQueries = await this.topicQueriesService.listByTopic(userId, topic.id);
        stage = `topic:${index}:plan_queries`;
        const diveDeeperSeedId = topic.segmentDiveDeeperSeedId;
        const diveDeeperSeed = diveDeeperSeedId ? await this.segmentDiveDeeperSeedsService.getSeedById(diveDeeperSeedId) : undefined;
        const topicPlan = await this.llmService.generateTopicQueries(topic.originalText, previousQueries.map((q) => q.query), {
          mode: diveDeeperSeedId ? 'dive_deeper' : 'standard',
          seedQueries: diveDeeperSeed?.seedQueries,
          focusClaims: diveDeeperSeed?.focusClaims,
          angle: diveDeeperSeed?.angle,
          contextBundle: diveDeeperSeed?.contextBundle,
          parentQueryTexts: Array.isArray(diveDeeperSeed?.contextBundle?.parent_query_texts)
            ? diveDeeperSeed?.contextBundle?.parent_query_texts
            : undefined,
        });
        const topicIntent = topicPlan.intent;
        const freshQueries = selectFreshQueries(topicPlan.queries, previousQueries);
        const fallbackQueries = selectFreshQueries([topic.originalText], previousQueries);
        const plannedQueries = (freshQueries.length ? freshQueries : fallbackQueries).slice(0, 5);
        const queriesToRun = plannedQueries.length ? plannedQueries : [topic.originalText];

        const queryResults: TopicQueryCreateInput[] = [];
        for (const [orderIndex, queryText] of queriesToRun.entries()) {
          stage = `topic:${index}:perplexity:${orderIndex}`;
          const perplexityResult = await this.perplexityService.search(queryText);
          queryResults.push({
            topicId: topic.id,
            episodeId,
            query: queryText,
            answer: perplexityResult.answer,
            citations: perplexityResult.citations || [],
            citationMetadata: perplexityResult.citationMetadata,
            orderIndex,
            intent: topicIntent,
          });
        }

        stage = `topic:${index}:persist_queries`;
        const savedQueries = await this.topicQueriesService.createMany(userId, queryResults);
        const segmentId = uuid();
        const segmentSources = buildEpisodeSources(queryResults, episodeId, segmentId);
        const segmentContent = buildSegmentContent(topic.originalText, savedQueries);
        stage = `topic:${index}:segment_script`;
        const instructionParts: string[] = [];
        if (diveDeeperSeed?.contextBundle?.segment_summary) {
          instructionParts.push(
            `This is a Dive Deeper continuation. Assume the listener just heard: ${String(diveDeeperSeed.contextBundle.segment_summary).trim()}`,
          );
        }
        if (diveDeeperSeed?.angle) {
          instructionParts.push(`Go deeper using this angle: ${diveDeeperSeed.angle.trim()}`);
        }
        if (Array.isArray(diveDeeperSeed?.focusClaims) && diveDeeperSeed.focusClaims.length) {
          instructionParts.push(`Prioritize deepening these claims: ${diveDeeperSeed.focusClaims.slice(0, 3).join(' | ')}`);
        }
        if (previousSegmentTitle !== null) {
          instructionParts.push(`This continues immediately after the previous segment on "${previousSegmentTitle}".`);
        }
        const instruction = instructionParts.length ? instructionParts.join(' ') : undefined;
        const segmentScript = await this.llmService.generateSegmentScript(
          topic.originalText,
          segmentContent,
          segmentSources,
          perSegmentTargetMinutes,
          instruction,
        );
        const segmentDialogue: SegmentDialogueScript = {
          title: topic.originalText,
          intent: undefined,
          turns: coerceTextToDialogue(segmentScript),
        };
        const segmentTitle = topic.originalText;
        const segmentScriptText = renderDialogueScript(segmentDialogue);
        stage = `topic:${index}:tts`;
        const segmentTtsResult = await this.ttsService.synthesize(segmentDialogue, { voiceA, voiceB });
        const segmentDurationSeconds =
          segmentTtsResult.durationSeconds ?? estimateDurationSeconds(segmentScriptText);
        const segmentStartSeconds = cumulativeStartSeconds;
        const gapPadding = index < topics.length - 1 ? this.segmentGapSeconds : 0;
        cumulativeStartSeconds += segmentDurationSeconds + gapPadding;

        segments.push({
          id: segmentId,
          episodeId,
          orderIndex: index,
          title: segmentTitle,
          intent: segmentDialogue.intent || topicIntent,
          rawContent: segmentContent,
          rawSources: segmentSources,
          script: segmentScriptText,
          dialogueScript: segmentDialogue,
          audioUrl: segmentTtsResult.storageKey ?? segmentTtsResult.audioUrl,
          startTimeSeconds: segmentStartSeconds,
          durationSeconds: segmentDurationSeconds,
        });

        previousSegmentTitle = segmentTitle;
      }

      stage = 'persist_segments';
      const persistedSegments =
        await this.episodeSegmentsService.replaceSegments(episodeId, segments);
      const normalizedSources = persistedSegments.flatMap((segment) => segment.rawSources || []);
      stage = 'persist_sources';
      await this.episodeSourcesService.replaceSources(episodeId, normalizedSources);

      stage = 'status:generating_dive_deeper_seeds';
      await this.markEpisodeStatus(userId, episodeId, 'generating_dive_deeper_seeds');
      try {
        stage = 'generate_dive_deeper_seeds';
        const now = new Date();
        const results = await Promise.allSettled(
          persistedSegments.map(async (segment) => {
            const parentQueryTexts = this.extractParentQueryTexts(segment.rawContent);
            const draft = await this.llmService.generateSegmentDiveDeeperSeed({
              parentTopicText: segment.title ?? 'Segment',
              segmentScript: segment.script ?? '',
              segmentSources: segment.rawSources ?? [],
              parentQueryTexts,
            });
            return {
              id: uuid(),
              episodeId,
              segmentId: segment.id,
              position: segment.orderIndex,
              title: draft.title,
              angle: draft.angle,
              focusClaims: draft.focusClaims ?? [],
              seedQueries: draft.seedQueries ?? [],
              contextBundle: draft.contextBundle ?? {},
              createdAt: now,
              updatedAt: now,
            };
          }),
        );
        const seeds = results
          .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
          .map((result) => result.value);
        const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
        for (const failure of failures) {
          const error = failure.reason;
          const message = error instanceof Error ? error.message : String(error);
          const raw = (error as any)?.rawContent;
          const snippet =
            typeof raw === 'string' && raw.trim()
              ? ` | snippet=${raw.replace(/\s+/g, ' ').trim().slice(0, 200)}`
              : '';
          this.logger.warn(`Dive deeper seed generation failed for a segment in episode ${episodeId}: ${message}${snippet}`);
        }
        if (seeds.length) {
          await this.segmentDiveDeeperSeedsService.replaceSeeds(episodeId, seeds);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const raw = (error as any)?.rawContent;
        const snippet =
          typeof raw === 'string' && raw.trim()
            ? ` | snippet=${raw.replace(/\s+/g, ' ').trim().slice(0, 260)}`
            : '';
        this.logger.warn(`Dive deeper seed generation failed for episode ${episodeId}: ${message}${snippet}`);
      }

      stage = 'generating_script';
      await this.markEpisodeStatus(userId, episodeId, 'generating_script');
      const fullDialogue = combineDialogueScripts(persistedSegments);
      const fullScript = renderDialogueScript(fullDialogue);

      stage = 'status:generating_audio';
      await this.markEpisodeStatus(userId, episodeId, 'generating_audio');
      stage = 'generate_metadata';
      const metadata = await this.llmService.generateEpisodeMetadata(fullScript, persistedSegments);
      const coverPrompt = await this.coverImageService.buildPrompt(metadata.title, persistedSegments);
      const coverPromise = this.coverImageService
        .generateCoverImage(userId, episodeId, coverPrompt)
        .then((result) => ({ ...result, prompt: coverPrompt }))
        .catch((error) => {
          stage = 'cover_image';
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Cover image generation failed for episode ${episodeId}: ${message}`);
          return { prompt: coverPrompt } as { prompt: string; imageUrl?: string; storageKey?: string };
        });
      const audioPromise = this.stitchSegmentAudioWithRetries(persistedSegments, userId, episodeId).catch((error) => {
        stage = 'stitch_audio';
        throw error;
      });
      stage = 'generate_audio_and_cover';
      const [stitchedAudio, coverResult] = await Promise.all([audioPromise, coverPromise]);
      const audioUrl = stitchedAudio.storageKey ?? stitchedAudio.audioUrl;
      const episodeDurationSeconds = stitchedAudio.durationSeconds ?? cumulativeStartSeconds;

      stage = 'mark_ready';
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
      try {
        stage = 'notify_ready';
        await this.notificationsService.notifyEpisodeStatus(userId, {
          episodeId,
          status: 'ready',
          title: metadata.title,
          description: metadata.description,
        });
      } catch (notifyError) {
        this.logger.warn(
          `Failed to send ready notification for episode ${episodeId}: ${
            notifyError instanceof Error ? notifyError.message : notifyError
          }`,
        );
      }
      try {
        stage = 'record_usage';
        await this.entitlementsService.recordEpisodeUsage(userId, episodeId, episodeDurationSeconds);
      } catch (error) {
        this.logger.error(
          `Failed to record usage for episode ${episodeId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    } catch (error: any) {
      const axiosData = error?.response?.data ? ` | data=${JSON.stringify(error.response.data)}` : '';
      const description = this.describeError(error);
      this.logger.error(`Failed to process episode ${episodeId} at ${stage}: ${description}${axiosData}`);
      await this.markEpisodeStatus(userId, episodeId, 'failed', {
        errorMessage: this.buildErrorMessage(error, stage),
      });
      try {
        await this.notificationsService.notifyEpisodeStatus(userId, {
          episodeId,
          status: 'failed',
          description: this.buildErrorMessage(error, stage),
        });
      } catch (notifyError) {
        this.logger.warn(
          `Failed to send failure notification for episode ${episodeId}: ${
            notifyError instanceof Error ? notifyError.message : notifyError
          }`,
        );
      }
      throw error;
    }
  }

  private extractParentQueryTexts(rawContent: string): string[] {
    const lines = (rawContent || '').split('\n');
    const queries: string[] = [];
    for (const line of lines) {
      const match = line.match(/^\s*Query\s+\d+\s*:\s*(.+)\s*$/i);
      if (!match) {
        continue;
      }
      const query = match[1]?.trim();
      if (query) {
        queries.push(query);
      }
    }
    return queries;
  }

  private async stitchSegmentAudio(
    segments: EpisodeSegment[],
    userId: string,
    episodeId: string,
  ): Promise<{ audioUrl: string; storageKey: string; durationSeconds?: number }> {
    const ffmpegPath = ffmpeg;
    if (!ffmpegPath) {
      throw new Error('ffmpeg binary not found; cannot stitch episode audio');
    }
    const ordered = [...segments].sort((a, b) => a.orderIndex - b.orderIndex);
    const audioKeys = ordered
      .map((segment) => segment.audioUrl?.trim())
      .filter((key): key is string => Boolean(key));
    if (!audioKeys.length) {
      throw new Error('No segment audio available to stitch');
    }

    const workingDir = await this.createWorkingDirectory();
    const concatEntries: string[] = [];
    let silencePath: string | null = null;

    try {
      for (const [index, key] of audioKeys.entries()) {
        const buffer = await this.storageService.fetchAudioBuffer(key);
        if (!silencePath && audioKeys.length > 1) {
          const formatHint = await this.detectAudioFormat(buffer);
          silencePath = await this.createSilenceFile(ffmpegPath, workingDir, {
            durationSeconds: this.segmentGapSeconds,
            ...formatHint,
          });
        }
        const partPath = path.join(workingDir, `part-${index}.mp3`);
        await fs.writeFile(partPath, buffer);
        concatEntries.push(`file '${partPath.replace(/'/g, "'\\''")}'`);
        if (silencePath && index < audioKeys.length - 1) {
          concatEntries.push(`file '${silencePath.replace(/'/g, "'\\''")}'`);
        }
      }

      const listPath = path.join(workingDir, 'concat.txt');
      await fs.writeFile(listPath, concatEntries.join('\n'));

      const outputPath = path.join(workingDir, 'output.mp3');
      await this.runFfmpeg(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]);

      const combinedBuffer = await fs.readFile(outputPath);
      const durationSeconds = await this.measureDurationSeconds(combinedBuffer);
      const audioKey = `${userId}/${episodeId}.mp3`;
      const upload = await this.storageService.uploadAudio(combinedBuffer, audioKey);
      return { audioUrl: upload.url, storageKey: upload.key, durationSeconds };
    } finally {
      await fs.rm(workingDir, { recursive: true, force: true });
    }
  }

  private async createSilenceFile(
    ffmpegPath: string,
    workingDir: string,
    options?: { durationSeconds?: number; sampleRate?: number; channels?: number },
  ): Promise<string> {
    const durationSeconds =
      options?.durationSeconds && options.durationSeconds > 0 ? options.durationSeconds : this.segmentGapSeconds;
    const sampleRate =
      options?.sampleRate && Number.isFinite(options.sampleRate) && options.sampleRate > 0
        ? Math.round(options.sampleRate)
        : 44100;
    const channels = options?.channels === 1 ? 1 : 2;
    const channelLayout = channels === 1 ? 'mono' : 'stereo';
    const silencePath = path.join(workingDir, `silence-${durationSeconds}s.mp3`);
    await this.runFfmpeg(ffmpegPath, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=${sampleRate}:cl=${channelLayout}`,
      '-t',
      durationSeconds.toString(),
      '-ac',
      channels.toString(),
      '-ar',
      sampleRate.toString(),
      '-q:a',
      '9',
      silencePath,
    ]);
    return silencePath;
  }

  private async detectAudioFormat(buffer: Buffer): Promise<{ sampleRate?: number; channels?: number }> {
    try {
      const metadata = await parseBuffer(buffer, 'audio/mpeg');
      const sampleRate = metadata?.format?.sampleRate;
      const channels = (metadata?.format as any)?.numberOfChannels ?? (metadata?.format as any)?.channels;
      return { sampleRate, channels };
    } catch (error) {
      this.logger.warn(
        `Failed to read segment audio format: ${error instanceof Error ? error.message : error}`,
      );
      return {};
    }
  }

  private async stitchSegmentAudioWithRetries(
    segments: EpisodeSegment[],
    userId: string,
    episodeId: string,
    maxRetries = 2,
  ): Promise<{ audioUrl: string; storageKey: string; durationSeconds?: number }> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= maxRetries) {
      try {
        if (attempt > 0) {
          this.logger.warn(
            `Retrying stitch for episode ${episodeId} (attempt ${attempt + 1} of ${maxRetries + 1})`,
          );
        }
        return await this.stitchSegmentAudio(segments, userId, episodeId);
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt > maxRetries) {
          throw error;
        }
      }
    }
    throw lastError ?? new Error('Unknown stitching error');
  }

  private async runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, args, { stdio: 'ignore' });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });
    });
  }

  private async measureDurationSeconds(buffer: Buffer): Promise<number | undefined> {
    try {
      const metadata = await parseBuffer(buffer, 'audio/mpeg');
      const seconds = metadata?.format?.duration;
      if (!seconds || !isFinite(seconds) || seconds <= 0) {
        return undefined;
      }
      return Math.round(seconds);
    } catch (error) {
      this.logger.warn(
        `Failed to read stitched audio duration: ${error instanceof Error ? error.message : error}`,
      );
      return undefined;
    }
  }

  private async createWorkingDirectory(): Promise<string> {
    const dir = path.resolve(process.cwd(), 'tmp', 'stitch', uuid());
    await fs.mkdir(dir, { recursive: true });
    return dir;
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

  private buildErrorMessage(_: unknown, stage: string): string {
    const label = this.getUserFacingStageLabel(stage);
    if (label) {
      return `Episode generation failed while ${label}. Please try again soon.`;
    }
    return 'Episode generation failed. Please try again soon.';
  }

  private describeError(error: unknown): string {
    if (!error) return 'Unknown error';
    const err = error as any;
    const parts: string[] = [];
    const message = err?.message || (typeof error === 'string' ? error : '');
    if (message) parts.push(message);
    const status = err?.response?.status ?? err?.status;
    if (status) parts.push(`status=${status}`);
    const code = err?.code || err?.response?.data?.code;
    if (code) parts.push(`code=${code}`);
    const data = err?.response?.data;
    if (data) {
      const dataText = typeof data === 'string' ? data : this.safeStringify(data);
      if (dataText) {
        parts.push(`data=${dataText}`);
      }
    }
    if (err?.stack && typeof err.stack === 'string') {
      const firstLine = err.stack.split('\n')[0]?.trim();
      if (firstLine) {
        parts.push(firstLine);
      }
    }
    return parts.filter(Boolean).join(' | ') || String(error);
  }

  private getUserFacingStageLabel(stage: string): string | null {
    if (!stage) {
      return null;
    }
    const normalized = stage.toLowerCase();
    if (normalized.includes('segment_script')) {
      return 'writing this topic script';
    }
    if (normalized.includes('enhance_dialogue')) {
      return 'refining the dialogue';
    }
    if (normalized.includes('perplexity') || normalized.includes('retrieving_content')) {
      return 'gathering research';
    }
    if (normalized.includes('tts')) {
      return 'synthesizing the audio';
    }
    if (normalized.includes('generating_audio') || normalized.includes('stitch_audio')) {
      return 'assembling the audio';
    }
    if (normalized.includes('generate_metadata')) {
      return 'summarizing the episode';
    }
    if (normalized.includes('cover_image')) {
      return 'creating the cover art';
    }
    if (normalized.includes('persist_segments') || normalized.includes('persist_sources')) {
      return 'saving the generated content';
    }
    if (normalized.includes('mark_ready')) {
      return 'finalizing the episode';
    }
    if (normalized.includes('notify')) {
      return 'sending an update';
    }
    if (normalized.includes('list_topics') || normalized.includes('init')) {
      return 'reviewing topics';
    }
    return 'processing your episode';
  }

  private safeStringify(value: unknown, maxLength = 500): string | undefined {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (!serialized) return undefined;
      return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}...` : serialized;
    } catch {
      return undefined;
    }
  }
}
