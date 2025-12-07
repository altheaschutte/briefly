import { Episode, EpisodeStatus } from '../domain/types';

export const EPISODES_REPOSITORY = 'EPISODES_REPOSITORY';

export interface EpisodesRepository {
  create(userId: string, targetDurationMinutes: number, status: EpisodeStatus): Promise<Episode>;
  listByUser(userId: string): Promise<Episode[]>;
  getById(userId: string, episodeId: string): Promise<Episode | undefined>;
  update(userId: string, episodeId: string, updates: Partial<Episode>): Promise<Episode | undefined>;
}
