import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { Episode, EpisodeStatus } from '../domain/types';
import { EpisodesRepository } from './episodes.repository';

@Injectable()
export class InMemoryEpisodesRepository implements EpisodesRepository {
  constructor(private readonly store: InMemoryStoreService) {}

  async create(userId: string, targetDurationMinutes: number, status: EpisodeStatus): Promise<Episode> {
    const now = new Date();
    const episode: Episode = {
      id: uuid(),
      userId,
      status,
      targetDurationMinutes,
      createdAt: now,
      updatedAt: now,
    };
    this.store.saveEpisode(episode);
    return episode;
  }

  async listByUser(userId: string): Promise<Episode[]> {
    return this.store.getEpisodes(userId);
  }

  async getById(userId: string, episodeId: string): Promise<Episode | undefined> {
    return this.store.getEpisode(userId, episodeId);
  }

  async update(userId: string, episodeId: string, updates: Partial<Episode>): Promise<Episode | undefined> {
    const existing = this.store.getEpisode(userId, episodeId);
    if (!existing) {
      return undefined;
    }
    const updated: Episode = { ...existing, ...updates, updatedAt: new Date() };
    this.store.saveEpisode(updated);
    return updated;
  }
}
