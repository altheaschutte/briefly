import { EpisodeSource } from '../domain/types';

export const EPISODE_SOURCES_REPOSITORY = 'EPISODE_SOURCES_REPOSITORY';

export interface EpisodeSourcesRepository {
  replaceForEpisode(episodeId: string, sources: EpisodeSource[]): Promise<EpisodeSource[]>;
  listForEpisode(episodeId: string): Promise<EpisodeSource[]>;
}
