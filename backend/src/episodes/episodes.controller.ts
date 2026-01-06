import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Req,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Queue } from 'bullmq';
import fetch from 'node-fetch';
import { EpisodesService } from './episodes.service';
import { EPISODES_QUEUE_TOKEN } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';
import { EpisodeSourcesService } from './episode-sources.service';
import { Episode, EpisodeSegment, EpisodeSource } from '../domain/types';
import { EpisodeSegmentsService } from './episode-segments.service';
import { LlmUsageService } from '../llm-usage/llm-usage.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { EpisodePlansService } from '../episode-plans/episode-plans.service';

@Controller('episodes')
export class EpisodesController {
  private readonly logger = new Logger(EpisodesController.name);

  constructor(
    private readonly episodesService: EpisodesService,
    private readonly storageService: StorageService,
    private readonly episodeSourcesService: EpisodeSourcesService,
    private readonly episodeSegmentsService: EpisodeSegmentsService,
    private readonly entitlementsService: EntitlementsService,
    private readonly llmUsageService: LlmUsageService,
    private readonly episodePlansService: EpisodePlansService,
    @Inject(EPISODES_QUEUE_TOKEN) private readonly episodesQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  async createEpisode(@Req() req: Request, @Body('planId') planId?: string) {
    const userId = (req as any).user?.id as string;
    if (!planId) {
      throw new BadRequestException('planId is required');
    }
    const plan = await this.episodePlansService.getPlan(userId, planId);
    if (!plan) {
      throw new BadRequestException('Episode plan not found');
    }
    const targetDuration = plan.episodeSpec?.durationMinutes ?? this.entitlementsService.getDefaultDurationMinutes();
    await this.entitlementsService.ensureCanCreateEpisode(userId, targetDuration);
    const episode = await this.episodesService.createEpisode(userId, targetDuration, planId);
    await this.episodesQueue.add('generate', { episodeId: episode.id, userId, planId });
    return { episodeId: episode.id, status: episode.status };
  }

  @Get()
  async listEpisodes(@Req() req: Request) {
    const userId = (req as any).user?.id as string;
    const episodes = await this.episodesService.listEpisodes(userId);
    return Promise.all(
      episodes.map((episode) => this.formatEpisodeResponse(userId, episode, { includeSegments: false })),
    );
  }

  @Get(':id')
  async getEpisode(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    const episode = await this.episodesService.getEpisode(userId, id);
    return this.formatEpisodeResponse(userId, episode, {
      includeSegments: true,
      includeSources: true,
      includeDiveDeeperSeeds: true,
    });
  }

  @Get(':id/sources')
  async getEpisodeSources(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    await this.episodesService.getEpisode(userId, id);
    return this.episodeSourcesService.listSources(id);
  }

  @Get(':id/audio')
  async getEpisodeAudio(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    const episode = await this.episodesService.getEpisode(userId, id);
    const signedUrl = await this.resolveAudioUrl(userId, episode);
    return { audioUrl: signedUrl };
  }

  @Get(':id/llm-usage')
  async getEpisodeLlmUsage(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    await this.episodesService.getEpisode(userId, id);
    return this.llmUsageService.getEpisodeTotals(userId, id);
  }

  @Get(':id/status')
  async getEpisodeWorkflowStatus(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    const episode = await this.episodesService.getEpisode(userId, id);
    if (!episode.workflowRunId) {
      throw new BadRequestException('No workflow run id is recorded for this episode.');
    }

    const baseUrl = this.configService.get<string>('MASTRA_API_URL');
    const apiKey = this.configService.get<string>('MASTRA_API_KEY');
    if (!baseUrl) {
      throw new ServiceUnavailableException('MASTRA_API_URL is not configured');
    }
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const apiBase = normalizedBase.endsWith('/api') ? normalizedBase : `${normalizedBase}/api`;
    const workflowKey = 'researchAndScriptWorkflow'; // registry key used by Mastra routes
    const url = `${apiBase}/workflows/${workflowKey}/runs/${encodeURIComponent(episode.workflowRunId)}`;

    let resp;
    try {
      resp = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to reach Mastra for run ${episode.workflowRunId}: ${message}`);
      throw new ServiceUnavailableException(`Failed to reach Mastra: ${message}`);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Mastra run lookup failed (${resp.status}): ${text.slice(0, 200)}`,
      );
    }

    const payload = await resp.json().catch(() => ({}));
    const workerUpdatedAt = episode.updatedAt instanceof Date ? episode.updatedAt.toISOString() : episode.updatedAt;
    const worker = {
      status: episode.status,
      updatedAt: workerUpdatedAt ?? null,
      errorMessage: episode.errorMessage ?? null,
    };

    return {
      workflowId: workflowKey,
      runId: episode.workflowRunId,
      run: payload,
      worker,
    };
  }

  @Delete(':id')
  async archiveEpisode(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    await this.episodesService.archiveEpisode(userId, id);
    return { success: true };
  }

  @Get('workflows/research-and-script/health')
  async checkResearchWorkflow(@Req() req: Request) {
    const userId = (req as any).user?.id as string;
    if (!userId) {
      throw new ServiceUnavailableException('Missing user session');
    }
    const baseUrl = this.configService.get<string>('MASTRA_API_URL');
    if (!baseUrl) {
      throw new ServiceUnavailableException('MASTRA_API_URL is not configured');
    }
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const apiBase = normalizedBase.endsWith('/api') ? normalizedBase : `${normalizedBase}/api`;
    const url = `${apiBase}/workflows?partial=true`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Mastra workflows check failed (${resp.status}): ${text.slice(0, 200)}`,
      );
    }
    const data: any = await resp.json().catch(() => ({}));
    const workflows = Array.isArray(data) ? data : data?.workflows ?? [];
    const workflowId = 'research-and-script-workflow';
    const available = workflows.some((workflow: any) => workflow?.id === workflowId);

    return {
      ok: true,
      workflowId,
      available,
      url,
    };
  }

  private async formatEpisodeResponse(
    userId: string,
    episode: Episode,
    options?: { includeSegments?: boolean; includeSources?: boolean; includeDiveDeeperSeeds?: boolean },
  ) {
    const createdAt = episode.createdAt instanceof Date ? episode.createdAt.toISOString() : episode.createdAt;
    const updatedAt = episode.updatedAt instanceof Date ? episode.updatedAt.toISOString() : episode.updatedAt;
    const audioUrl = await this.resolveAudioUrl(userId, episode);
    const segments = options?.includeSegments ? await this.episodeSegmentsService.listSegments(episode.id) : undefined;
    const sources = options?.includeSources ? await this.episodeSourcesService.listSources(episode.id) : undefined;
    return {
      ...episode,
      audioUrl: audioUrl ?? undefined,
      audio_url: audioUrl,
      episode_number: episode.episodeNumber ?? null,
      duration_seconds: episode.durationSeconds ?? null,
      target_duration_minutes: episode.targetDurationMinutes ?? null,
      created_at: createdAt ?? null,
      updated_at: updatedAt ?? null,
      cover_image_url: episode.coverImageUrl ?? null,
      cover_prompt: episode.coverPrompt ?? null,
      parent_episode_id: episode.parentEpisodeId ?? null,
      parent_segment_id: episode.parentSegmentId ?? null,
      dive_deeper_seed_id: episode.diveDeeperSeedId ?? null,
      segments: segments?.map((segment) => this.formatSegmentResponse(segment)),
      sources: sources?.map((source) => this.formatSourceResponse(source)),
      dive_deeper_seeds: [],
    };
  }

  private formatSegmentResponse(segment: EpisodeSegment) {
    const sources = (segment.rawSources || []).map((source) => this.formatSourceResponse(source));
    return {
      ...segment,
      order_index: segment.orderIndex ?? null,
      raw_content: segment.rawContent,
      rawSources: sources,
      raw_sources: sources,
      sources,
      script: segment.script ?? null,
      audio_url: segment.audioUrl ?? null,
      start_time_seconds: segment.startTimeSeconds ?? null,
      duration_seconds: segment.durationSeconds ?? null,
    };
  }

  private formatSourceResponse(source: EpisodeSource) {
    return {
      ...source,
      episode_id: source.episodeId ?? null,
      segment_id: source.segmentId ?? null,
      title: source.title ?? source.sourceTitle,
      source_title: source.sourceTitle,
      url: source.url,
    };
  }

  private async resolveAudioUrl(userId: string, episode: Episode): Promise<string | null> {
    const audioKey = this.getAudioStorageKey(userId, episode);
    if (!audioKey) {
      return null;
    }
    const lower = audioKey.toLowerCase();
    if (lower.startsWith('file://')) {
      return audioKey;
    }
    try {
      return await this.storageService.getEpisodeAudioSignedUrl(userId, episode.id, audioKey);
    } catch (error) {
      this.logger.error(
        `Failed to sign audio URL for episode ${episode.id}: ${error instanceof Error ? error.message : error}`,
      );
      if (lower.startsWith('http://') || lower.startsWith('https://')) {
        return audioKey;
      }
      return null;
    }
  }

  private getAudioStorageKey(userId: string, episode: Episode): string | undefined {
    if (episode.audioUrl) {
      return episode.audioUrl;
    }
    if (episode.status === 'ready' && userId && episode.id) {
      return `${userId}/${episode.id}.mp3`;
    }
    return undefined;
  }
}
