import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { Episode, EpisodeStatus } from '../domain/types';
import { EpisodesRepository, ListEpisodesOptions } from './episodes.repository';

@Injectable()
export class InMemoryEpisodesRepository implements EpisodesRepository {
  constructor(private readonly store: InMemoryStoreService) {}

  async create(
    userId: string,
    targetDurationMinutes: number,
    status: EpisodeStatus,
    options?: { planId?: string },
  ): Promise<Episode> {
    const now = new Date();
    const existing = this.store.getEpisodes(userId);
    const nextNumber = (existing.map((e) => e.episodeNumber || 0).sort((a, b) => b - a)[0] ?? 0) + 1;
    const episode: Episode = {
      id: uuid(),
      userId,
      episodeNumber: nextNumber,
      title: undefined,
      status,
      archivedAt: undefined,
      targetDurationMinutes,
      planId: options?.planId,
      coverImageUrl: undefined,
      coverPrompt: undefined,
      createdAt: now,
      updatedAt: now,
    };
    this.store.saveEpisode(episode);
    return episode;
  }

  async listByUser(userId: string, options?: ListEpisodesOptions): Promise<Episode[]> {
    const { includeArchived = false, includeFailed = false } = options || {};
    return this.store
      .getEpisodes(userId)
      .filter((episode) => (includeFailed ? true : episode.status !== 'failed'))
      .filter((episode) => (includeArchived ? true : !episode.archivedAt))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getById(userId: string, episodeId: string): Promise<Episode | undefined> {
    const episode = this.store.getEpisode(userId, episodeId);
    if (episode?.archivedAt) {
      return undefined;
    }
    return episode;
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

  async archive(userId: string, episodeId: string): Promise<Episode | undefined> {
    const existing = this.store.getEpisode(userId, episodeId);
    if (!existing || existing.archivedAt) {
      return undefined;
    }
    const archived: Episode = { ...existing, archivedAt: new Date(), updatedAt: new Date() };
    this.store.saveEpisode(archived);
    return archived;
  }
}
