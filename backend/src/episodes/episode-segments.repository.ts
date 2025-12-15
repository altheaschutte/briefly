import { EpisodeSegment } from '../domain/types';

export const EPISODE_SEGMENTS_REPOSITORY = 'EPISODE_SEGMENTS_REPOSITORY';

export interface EpisodeSegmentsRepository {
  replaceForEpisode(episodeId: string, segments: EpisodeSegment[]): Promise<EpisodeSegment[]>;
  listForEpisode(episodeId: string): Promise<EpisodeSegment[]>;
}
