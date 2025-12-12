import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Episode, EpisodeStatus } from '../domain/types';
import { EPISODES_REPOSITORY, EpisodesRepository } from './episodes.repository';

@Injectable()
export class EpisodesService {
  private readonly defaultDuration: number;

  constructor(
    @Inject(EPISODES_REPOSITORY) private readonly repository: EpisodesRepository,
    private readonly configService: ConfigService,
  ) {
    this.defaultDuration = Number(this.configService.get('EPISODE_DEFAULT_DURATION_MINUTES')) || 20;
  }

  createEpisode(userId: string, targetDurationMinutes?: number): Promise<Episode> {
    return this.repository.create(userId, targetDurationMinutes || this.defaultDuration, 'queued');
  }

  listEpisodes(userId: string): Promise<Episode[]> {
    return this.repository.listByUser(userId).then((episodes) =>
      episodes
        .filter((e) => e.status !== 'failed' && !e.archivedAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    );
  }

  async getEpisode(userId: string, episodeId: string): Promise<Episode> {
    const episode = await this.repository.getById(userId, episodeId);
    if (!episode || episode.archivedAt) {
      throw new NotFoundException('Episode not found');
    }
    return episode;
  }

  async updateEpisode(
    userId: string,
    episodeId: string,
    updates: Partial<Episode> & { status?: EpisodeStatus },
  ): Promise<Episode> {
    const existing = await this.getEpisode(userId, episodeId);
    const updated = await this.repository.update(userId, episodeId, {
      ...updates,
      episodeNumber: updates.episodeNumber ?? existing.episodeNumber,
      title: updates.title ?? existing.title,
      targetDurationMinutes: updates.targetDurationMinutes ?? existing.targetDurationMinutes,
      status: updates.status ?? existing.status,
      audioUrl: updates.audioUrl ?? existing.audioUrl,
      coverImageUrl: updates.coverImageUrl ?? existing.coverImageUrl,
      coverPrompt: updates.coverPrompt ?? existing.coverPrompt,
      transcript: updates.transcript ?? existing.transcript,
      scriptPrompt: updates.scriptPrompt ?? existing.scriptPrompt,
      showNotes: updates.showNotes ?? existing.showNotes,
      description: updates.description ?? existing.description,
      errorMessage: updates.errorMessage ?? existing.errorMessage,
      durationSeconds: updates.durationSeconds ?? existing.durationSeconds,
      archivedAt: updates.archivedAt ?? existing.archivedAt,
    });
    if (!updated) {
      throw new NotFoundException('Episode not found');
    }
    return updated;
  }

  async archiveEpisode(userId: string, episodeId: string): Promise<Episode> {
    const archived = await this.repository.archive(userId, episodeId);
    if (!archived) {
      throw new NotFoundException('Episode not found');
    }
    return archived;
  }
}
