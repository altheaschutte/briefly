import { Body, Controller, Delete, Get, Inject, Logger, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Queue } from 'bullmq';
import { EpisodesService } from './episodes.service';
import { EPISODES_QUEUE_TOKEN } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';
import { EpisodeSourcesService } from './episode-sources.service';
import { Episode } from '../domain/types';

@Controller('episodes')
export class EpisodesController {
  private readonly logger = new Logger(EpisodesController.name);

  constructor(
    private readonly episodesService: EpisodesService,
    private readonly storageService: StorageService,
    private readonly episodeSourcesService: EpisodeSourcesService,
    @Inject(EPISODES_QUEUE_TOKEN) private readonly episodesQueue: Queue,
  ) {}

  @Post()
  async createEpisode(@Req() req: Request, @Body('duration') duration?: number) {
    const userId = (req as any).user?.id as string;
    const episode = await this.episodesService.createEpisode(userId, duration);
    await this.episodesQueue.add('generate', { episodeId: episode.id, userId, duration });
    return { episodeId: episode.id, status: episode.status };
  }

  @Get()
  async listEpisodes(@Req() req: Request) {
    const userId = (req as any).user?.id as string;
    const episodes = await this.episodesService.listEpisodes(userId);
    return Promise.all(episodes.map((episode) => this.formatEpisodeResponse(episode)));
  }

  @Get(':id')
  async getEpisode(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    const episode = await this.episodesService.getEpisode(userId, id);
    return this.formatEpisodeResponse(episode);
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
    if (!episode.audioUrl) {
      return { audioUrl: null };
    }
    const signedUrl = await this.storageService.getSignedUrl(episode.audioUrl);
    return { audioUrl: signedUrl };
  }

  @Delete(':id')
  async archiveEpisode(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    await this.episodesService.archiveEpisode(userId, id);
    return { success: true };
  }

  private async formatEpisodeResponse(episode: Episode) {
    const createdAt = episode.createdAt instanceof Date ? episode.createdAt.toISOString() : episode.createdAt;
    const updatedAt = episode.updatedAt instanceof Date ? episode.updatedAt.toISOString() : episode.updatedAt;
    const audioUrl = await this.resolveAudioUrl(episode.audioUrl);

    return {
      ...episode,
      audio_url: audioUrl,
      episode_number: episode.episodeNumber ?? null,
      duration_seconds: episode.durationSeconds ?? null,
      target_duration_minutes: episode.targetDurationMinutes ?? null,
      created_at: createdAt ?? null,
      updated_at: updatedAt ?? null,
      cover_image_url: episode.coverImageUrl ?? null,
      cover_prompt: episode.coverPrompt ?? null,
    };
  }

  private async resolveAudioUrl(audioUrl?: string): Promise<string | null> {
    if (!audioUrl) {
      return null;
    }
    // If it's already an absolute URL, return as-is.
    const lower = audioUrl.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
      return audioUrl;
    }
    try {
      return await this.storageService.getSignedUrl(audioUrl);
    } catch (error) {
      this.logger.warn(`Failed to sign audio URL ${audioUrl}: ${error}`);
      return audioUrl;
    }
  }
}
