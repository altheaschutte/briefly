import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Queue } from 'bullmq';
import { EpisodesService } from './episodes.service';
import { EPISODES_QUEUE_TOKEN } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';

@Controller('episodes')
export class EpisodesController {
  constructor(
    private readonly episodesService: EpisodesService,
    private readonly storageService: StorageService,
    @Inject(EPISODES_QUEUE_TOKEN) private readonly episodesQueue: Queue,
  ) {}

  @Post()
  async createEpisode(@Req() req: Request, @Body('duration') duration?: number) {
    const userId = (req as any).user?.id as string;
    const episode = this.episodesService.createEpisode(userId, duration);
    await this.episodesQueue.add('generate', { episodeId: episode.id, userId, duration });
    return { episodeId: episode.id, status: episode.status };
  }

  @Get()
  listEpisodes(@Req() req: Request) {
    const userId = (req as any).user?.id as string;
    return this.episodesService.listEpisodes(userId);
  }

  @Get(':id')
  getEpisode(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    return this.episodesService.getEpisode(userId, id);
  }

  @Get(':id/audio')
  async getEpisodeAudio(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    const episode = this.episodesService.getEpisode(userId, id);
    if (!episode.audioUrl) {
      return { audioUrl: null };
    }
    const signedUrl = await this.storageService.getSignedUrl(episode.audioUrl);
    return { audioUrl: signedUrl };
  }
}
