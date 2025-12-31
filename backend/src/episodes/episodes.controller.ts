import { Body, Controller, Delete, Get, Inject, Logger, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Queue } from 'bullmq';
import { EpisodesService } from './episodes.service';
import { EPISODES_QUEUE_TOKEN } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';
import { EpisodeSourcesService } from './episode-sources.service';
import { Episode, EpisodeSegment, EpisodeSource, SegmentDiveDeeperSeed } from '../domain/types';
import { EpisodeSegmentsService } from './episode-segments.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { SegmentDiveDeeperSeedsService } from './segment-dive-deeper-seeds.service';
import { TopicsService } from '../topics/topics.service';

@Controller('episodes')
export class EpisodesController {
  private readonly logger = new Logger(EpisodesController.name);

  constructor(
    private readonly episodesService: EpisodesService,
    private readonly storageService: StorageService,
    private readonly episodeSourcesService: EpisodeSourcesService,
    private readonly episodeSegmentsService: EpisodeSegmentsService,
    private readonly segmentDiveDeeperSeedsService: SegmentDiveDeeperSeedsService,
    private readonly topicsService: TopicsService,
    private readonly entitlementsService: EntitlementsService,
    @Inject(EPISODES_QUEUE_TOKEN) private readonly episodesQueue: Queue,
  ) {}

  @Post()
  async createEpisode(@Req() req: Request, @Body('duration') duration?: number) {
    const userId = (req as any).user?.id as string;
    const targetDuration = duration ?? this.entitlementsService.getDefaultDurationMinutes();
    await this.entitlementsService.ensureCanCreateEpisode(userId, targetDuration);
    const episode = await this.episodesService.createEpisode(userId, targetDuration);
    await this.episodesQueue.add('generate', { episodeId: episode.id, userId, duration: targetDuration });
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

  @Post(':episodeId/dive-deeper/:seedId')
  async createDiveDeeperEpisode(
    @Req() req: Request,
    @Param('episodeId') episodeId: string,
    @Param('seedId') seedId: string,
    @Body('duration') duration?: number,
  ) {
    const userId = (req as any).user?.id as string;
    await this.episodesService.getEpisode(userId, episodeId);
    const seed = await this.segmentDiveDeeperSeedsService.getSeedForEpisode(episodeId, seedId);
    const targetDuration = duration ?? this.episodesService.getDiveDeeperDefaultDurationMinutes();
    await this.entitlementsService.ensureCanCreateEpisode(userId, targetDuration);
    await this.topicsService.getOrCreateDiveDeeperTopic(userId, seed);
    const episode = await this.episodesService.createDiveDeeperEpisode(userId, {
      parentEpisodeId: episodeId,
      parentSegmentId: seed.segmentId,
      diveDeeperSeedId: seed.id,
      targetDurationMinutes: targetDuration,
    });
    await this.episodesQueue.add('generate', { episodeId: episode.id, userId, duration: targetDuration });
    return { episodeId: episode.id, status: episode.status };
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

  @Delete(':id')
  async archiveEpisode(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    await this.episodesService.archiveEpisode(userId, id);
    return { success: true };
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
    const diveDeeperSeeds = options?.includeDiveDeeperSeeds
      ? await this.segmentDiveDeeperSeedsService.listSeeds(episode.id)
      : undefined;

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
      dive_deeper_seeds: diveDeeperSeeds?.map((seed) => this.formatDiveDeeperSeedResponse(seed)),
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
      source_title: source.sourceTitle,
      url: source.url,
    };
  }

  private formatDiveDeeperSeedResponse(seed: SegmentDiveDeeperSeed) {
    const createdAt = seed.createdAt instanceof Date ? seed.createdAt.toISOString() : seed.createdAt;
    const updatedAt = seed.updatedAt instanceof Date ? seed.updatedAt.toISOString() : seed.updatedAt;
    return {
      ...seed,
      episode_id: seed.episodeId,
      segment_id: seed.segmentId,
      focus_claims: seed.focusClaims,
      seed_queries: seed.seedQueries,
      context_bundle: seed.contextBundle,
      created_at: createdAt ?? null,
      updated_at: updatedAt ?? null,
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
