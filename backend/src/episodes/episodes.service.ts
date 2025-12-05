import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuid } from 'uuid';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { Episode, EpisodeStatus } from '../domain/types';

@Injectable()
export class EpisodesService {
  private readonly defaultDuration: number;

  constructor(
    private readonly store: InMemoryStoreService,
    private readonly configService: ConfigService,
  ) {
    this.defaultDuration = Number(this.configService.get('EPISODE_DEFAULT_DURATION_MINUTES')) || 20;
  }

  createEpisode(userId: string, targetDurationMinutes?: number): Episode {
    const now = new Date();
    const episode: Episode = {
      id: uuid(),
      userId,
      status: 'queued',
      targetDurationMinutes: targetDurationMinutes || this.defaultDuration,
      createdAt: now,
      updatedAt: now,
    };
    this.store.saveEpisode(episode);
    return episode;
  }

  listEpisodes(userId: string): Episode[] {
    return this.store.getEpisodes(userId);
  }

  getEpisode(userId: string, episodeId: string): Episode {
    const episode = this.store.getEpisode(userId, episodeId);
    if (!episode) {
      throw new NotFoundException('Episode not found');
    }
    return episode;
  }

  updateEpisode(
    userId: string,
    episodeId: string,
    updates: Partial<Episode> & { status?: EpisodeStatus },
  ): Episode {
    const existing = this.getEpisode(userId, episodeId);
    const updated: Episode = { ...existing, ...updates, updatedAt: new Date() };
    this.store.saveEpisode(updated);
    return updated;
  }
}
