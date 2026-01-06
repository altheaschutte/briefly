import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { promises as fs } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import ffmpeg from 'ffmpeg-static';
import { parseBuffer } from 'music-metadata';
import { v4 as uuid } from 'uuid';
import { EpisodeSegmentsService } from './episode-segments.service';
import { EpisodeSourcesService } from './episode-sources.service';
import { EpisodesService } from './episodes.service';
import { EpisodePlansService } from '../episode-plans/episode-plans.service';
import { SegmentDialogueScript } from '../llm/llm.types';
import { getDefaultVoice } from '../tts/voice-config';
import { TtsService } from '../tts/tts.service';
import { estimateDurationSeconds } from './episode-script.utils';
import { EpisodeSegment, EpisodeSource } from '../domain/types';
import { StorageService } from '../storage/storage.service';
import { CoverImageService } from './cover-image.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { LlmUsageContextService } from '../llm-usage/llm-usage.context';
import { ConfigService } from '@nestjs/config';
import fetch from 'node-fetch';

@Injectable()
export class EpisodeProcessorService {
  private readonly logger = new Logger(EpisodeProcessorService.name);
  private readonly segmentGapSeconds = 1.5;

  constructor(
    private readonly episodesService: EpisodesService,
    private readonly episodeSegmentsService: EpisodeSegmentsService,
    private readonly episodeSourcesService: EpisodeSourcesService,
    private readonly episodePlansService: EpisodePlansService,
    private readonly ttsService: TtsService,
    private readonly storageService: StorageService,
    private readonly coverImageService: CoverImageService,
    private readonly notificationsService: NotificationsService,
    private readonly entitlementsService: EntitlementsService,
    private readonly llmUsageContext: LlmUsageContextService,
    private readonly configService: ConfigService,
  ) {}

  async process(job: Job<{ episodeId: string; userId: string; planId: string }>): Promise<void> {
    const { episodeId, userId, planId } = job.data;
    return this.llmUsageContext.run({ userId, episodeId, flow: 'episode_generation' }, async () => {
      let stage = 'init';
      try {
        this.logger.log(`Episode ${episodeId}: starting worker job (plan ${planId})`);

        stage = 'load_episode';
        const episode = await this.episodesService.getEpisode(userId, episodeId);
        if (!planId) {
          throw new Error('Missing planId in job payload');
        }

        stage = 'load_plan';
        const plan = await this.episodePlansService.getPlan(userId, planId);
        if (!plan) {
          throw new Error('Episode plan not found');
        }
        this.logger.debug(`Episode ${episodeId}: loaded plan ${plan.id} (resource ${plan.resourceId}, thread ${plan.threadId})`);

        stage = 'status:retrieving_content';
        await this.episodesService.updateEpisode(userId, episodeId, { status: 'retrieving_content' });
        this.logger.log(`Episode ${episodeId}: status -> retrieving_content`);

        stage = 'run_workflow';
        const workflowResult = await this.callMastraResearchAndScript({
          episodeSpec: plan.episodeSpec,
          assistantMessage: plan.assistantMessage,
          confidence: plan.confidence,
          userProfile: plan.userProfile,
          resourceId: plan.resourceId,
          threadId: plan.threadId,
        });

        if (workflowResult.runId) {
          try {
            await this.episodesService.updateEpisode(userId, episodeId, { workflowRunId: workflowResult.runId });
            this.logger.log(`Episode ${episodeId}: workflow runId ${workflowResult.runId} saved`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Episode ${episodeId}: failed to save workflow runId ${workflowResult.runId}: ${msg}`);
          }
        } else {
          this.logger.warn(`Episode ${episodeId}: workflow runId missing from start-async response`);
        }

        const { script, research, summary } = workflowResult.output;
        this.logger.debug(
          `Episode ${episodeId}: workflow output received (segments=${script?.script?.segments?.length ?? 0}, sourcesByQuery=${research?.sourcesByQuery?.length ?? 0})`,
        );
        const segments = this.buildSegmentsFromScript(script);

        stage = 'status:generating_audio';
        await this.episodesService.updateEpisode(userId, episodeId, { status: 'generating_audio' });
        this.logger.log(`Episode ${episodeId}: status -> generating_audio`);

        const voicedSegments = await this.synthesizeSegments(userId, episodeId, segments);
        stage = 'status:stitching_audio';
        await this.episodesService.updateEpisode(userId, episodeId, { status: 'stitching_audio' });
        this.logger.log(`Episode ${episodeId}: status -> stitching_audio`);

        const stitched = await this.stitchAudio(voicedSegments, userId, episodeId);
        this.logger.log(
          `Episode ${episodeId}: stitched audio (durationSeconds=${stitched.durationSeconds ?? 'n/a'}, key=${stitched.storageKey ?? stitched.audioUrl})`,
        );

        stage = 'persist_segments';
        const { segmentsWithSources, flattenedSources } = this.mapSourcesToSegments(voicedSegments, research);
        // Drop large research payload before continuing
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        workflowResult.output.research = undefined;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        (workflowResult as any).output = { ...workflowResult.output, research: undefined };
        const persistedSegments = await this.episodeSegmentsService.replaceSegments(episodeId, segmentsWithSources);

        stage = 'persist_sources';
        await this.episodeSourcesService.replaceSources(episodeId, flattenedSources);
        this.logger.debug(
          `Episode ${episodeId}: persisted ${persistedSegments.length} segments and ${flattenedSources.length} sources`,
        );

        stage = 'generate_cover';
        await this.episodesService.updateEpisode(userId, episodeId, { status: 'generating_cover_image' });
        this.logger.log(`Episode ${episodeId}: status -> generating_cover_image`);

        const coverPrompt = await this.coverImageService.buildPrompt(script.episodeTitle, persistedSegments);
        const cover = await this.coverImageService
          .generateCoverImage(userId, episodeId, coverPrompt)
          .catch((error) => {
            this.logger.warn(`Cover generation failed for episode ${episodeId}: ${error instanceof Error ? error.message : error}`);
            return { prompt: coverPrompt } as { prompt: string; imageUrl?: string; storageKey?: string };
          });
        const coverPromptValue = 'prompt' in cover ? cover.prompt : coverPrompt;

        stage = 'status:ready';
        const transcript = this.combineTranscript(script);
        await this.episodesService.updateEpisode(userId, episodeId, {
          status: 'ready',
          transcript,
          showNotes: script.showNotes.join('\n'),
          title: script.episodeTitle,
          description: summary,
          audioUrl: stitched.storageKey ?? stitched.audioUrl,
          durationSeconds: stitched.durationSeconds ?? this.sumDurations(voicedSegments),
          coverImageUrl: cover.imageUrl,
          coverPrompt: coverPromptValue,
          targetDurationMinutes: script.durationMinutes,
          planId: planId,
        });
        this.logger.log(`Episode ${episodeId}: status -> ready (title="${script.episodeTitle}")`);

        await this.notificationsService.notifyEpisodeStatus(userId, {
          episodeId,
          status: 'ready',
          title: script.episodeTitle,
          description: summary,
        });

        await this.entitlementsService.recordEpisodeUsage(userId, episodeId, stitched.durationSeconds ?? 0);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to process episode ${episodeId} at stage ${stage}: ${message}`);
        await this.episodesService.updateEpisode(userId, episodeId, {
          status: 'failed',
          errorMessage: message,
        });
        try {
          await this.notificationsService.notifyEpisodeStatus(userId, {
            episodeId,
            status: 'failed',
            description: message,
          });
        } catch {
          /* ignore */
        }
        throw error;
      }
    });
  }

  private buildSegmentsFromScript(script: any): EpisodeSegment[] {
    const segments: EpisodeSegment[] = [];
    const pushSegment = (text: string, title: string, segmentType: 'intro' | 'body' | 'outro', order: number) => {
      segments.push({
        id: uuid(),
        episodeId: '',
        orderIndex: order,
        segmentType,
        title,
        rawContent: '',
        rawSources: [],
        script: text,
      });
    };
    let order = 0;
    if (script.script.intro?.trim()) {
      pushSegment(script.script.intro.trim(), 'Intro', 'intro', order++);
    }
    for (const seg of script.script.segments ?? []) {
      pushSegment(seg.script.trim(), seg.title || seg.segmentId || 'Segment', 'body', order++);
    }
    if (script.script.outro?.trim()) {
      pushSegment(script.script.outro.trim(), 'Outro', 'outro', order++);
    }
    return segments;
  }

  private async synthesizeSegments(
    userId: string,
    episodeId: string,
    segments: EpisodeSegment[],
  ): Promise<EpisodeSegment[]> {
    const { voice } = getDefaultVoice(this.configService);
    let runningStart = 0;
    const voiced: EpisodeSegment[] = [];

    for (const segment of segments) {
      const dialogue: SegmentDialogueScript = {
        title: segment.title ?? segment.segmentType ?? 'Segment',
        intent: undefined,
        turns: [{ speaker: 'SPEAKER_1', text: segment.script ?? '' }],
      };
      const tts = await this.ttsService.synthesize(dialogue, {
        voice,
        storageKey: `${userId}/${episodeId}/${segment.id}.mp3`,
      });
      const duration = tts.durationSeconds ?? estimateDurationSeconds(segment.script ?? '');
      voiced.push({
        ...segment,
        audioUrl: tts.storageKey ?? tts.audioUrl,
        durationSeconds: duration,
        startTimeSeconds: runningStart,
      });
      runningStart += duration + this.segmentGapSeconds;
    }
    return voiced;
  }

  private async stitchAudio(
    segments: EpisodeSegment[],
    userId: string,
    episodeId: string,
  ): Promise<{ audioUrl: string; storageKey: string; durationSeconds?: number }> {
    const ffmpegPath = ffmpeg;
    if (!ffmpegPath) throw new Error('ffmpeg binary not found; cannot stitch episode audio');
    const ordered = [...segments].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    const audioKeys = ordered.map((s) => s.audioUrl?.trim()).filter(Boolean) as string[];
    if (!audioKeys.length) throw new Error('No segment audio available to stitch');

    const workingDir = await this.createWorkingDirectory();
    const concatEntries: string[] = [];
    let silencePath: string | null = null;

    try {
      for (const [index, key] of audioKeys.entries()) {
      const buffer = await this.storageService.fetchAudioBuffer(key);
      if (!silencePath && audioKeys.length > 1) {
        silencePath = await this.createSilenceFile(ffmpegPath, workingDir, {
          durationSeconds: this.segmentGapSeconds,
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

  private mapSourcesToSegments(
    segments: EpisodeSegment[],
    research: any,
  ): { segmentsWithSources: EpisodeSegment[]; flattenedSources: EpisodeSource[] } {
    const bodySegments = segments.filter((s) => s.segmentType === 'body');
    const targetSegments = bodySegments.length ? bodySegments : segments;
    let segIndex = 0;

    const segmentSourcesMap = new Map<string, EpisodeSource[]>();
    const flattened: EpisodeSource[] = [];

    for (const entry of research?.sourcesByQuery ?? []) {
      for (const source of entry.sources ?? []) {
        if (!source.url) continue;
        const target = targetSegments[segIndex % targetSegments.length];
        segIndex += 1;
        const normalized: EpisodeSource = {
          id: uuid(),
          episodeId: '',
          segmentId: target.id,
          title: source.title ?? undefined,
          sourceTitle: source.title ?? source.url,
          url: source.url,
          type: undefined,
        };
        const bucket = segmentSourcesMap.get(target.id) ?? [];
        bucket.push(normalized);
        segmentSourcesMap.set(target.id, bucket);
        flattened.push(normalized);
      }
    }

    const segmentsWithSources = segments.map((seg) => ({
      ...seg,
      rawSources: segmentSourcesMap.get(seg.id) ?? [],
    }));

    return { segmentsWithSources, flattenedSources: flattened };
  }

  private combineTranscript(script: any): string {
    const parts: string[] = [];
    if (script.script.intro) parts.push(script.script.intro);
    for (const seg of script.script.segments ?? []) {
      if (seg.script) parts.push(seg.script);
    }
    if (script.script.outro) parts.push(script.script.outro);
    return parts.join('\n\n');
  }

  private sumDurations(segments: EpisodeSegment[]): number {
    return segments.reduce(
      (acc, seg, idx) => acc + (seg.durationSeconds ?? 0) + (idx < segments.length - 1 ? this.segmentGapSeconds : 0),
      0,
    );
  }

  private async callMastraResearchAndScript(input: any): Promise<{ output: any; runId?: string }> {
    const baseUrl = this.configService.get<string>('MASTRA_API_URL');
    const apiKey = this.configService.get<string>('MASTRA_API_KEY');
    if (!baseUrl) {
      throw new Error('MASTRA_API_URL is required to call Mastra workflows');
    }
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    // Mastra workflow routes use the workflow registry key (camelCase), not the ID string
    // exposed in `workflow.id`. The server reports this key via GET /api/workflows.
    const url = `${normalizedBase}/api/workflows/researchAndScriptWorkflow/start-async`;
    // start-async manages the run lifecycle; we only need to pass the input data (and resourceId when available)
    const payload: Record<string, any> = { inputData: input };
    if (input?.resourceId) {
      payload.resourceId = input.resourceId;
    }
    this.logger.debug(`Calling Mastra workflow at ${url}`);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Mastra workflow call failed (${resp.status}): ${text.slice(0, 500)}`);
    }
    const raw = await resp.clone().text().catch(() => '');
    this.logger.debug(
      `Mastra workflow response (status=${resp.status}, runIdHeader=${resp.headers.get('x-run-id') ?? 'n/a'}): ${raw.slice(0, 800)}`,
    );
    const data = await resp.json().catch(() => (raw ? JSON.parse(raw) : {}));
    const outputCandidate =
      data?.output ??
      data?.result?.output ??
      data?.result?.finalOutput ??
      (typeof data?.result === 'object' ? data.result : undefined);
    if (!outputCandidate) {
      throw new Error('Mastra workflow response missing output');
    }
    const runId =
      data?.runId ??
      data?.id ??
      data?.result?.runId ??
      data?.result?.id ??
      resp.headers.get('x-run-id') ??
      undefined;
    return { ...data, output: outputCandidate, runId };
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
      this.logger.warn(`Failed to read segment audio format: ${error instanceof Error ? error.message : error}`);
      return {};
    }
  }

  private async runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, args, { stdio: 'ignore' });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
    });
  }

  private async createWorkingDirectory(): Promise<string> {
    const dir = path.resolve(process.cwd(), 'tmp', 'stitch', uuid());
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  private async measureDurationSeconds(buffer: Buffer): Promise<number | undefined> {
    try {
      const metadata = await parseBuffer(buffer, 'audio/mpeg');
      const seconds = metadata?.format?.duration;
      if (!seconds || !isFinite(seconds) || seconds <= 0) return undefined;
      return Math.round(seconds);
    } catch (error) {
      this.logger.warn(`Failed to read stitched audio duration: ${error instanceof Error ? error.message : error}`);
      return undefined;
    }
  }
}
