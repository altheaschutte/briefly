import { SegmentDiveDeeperSeed } from '../domain/types';

export const SEGMENT_DIVE_DEEPER_SEEDS_REPOSITORY = 'SEGMENT_DIVE_DEEPER_SEEDS_REPOSITORY';

export interface SegmentDiveDeeperSeedsRepository {
  replaceForEpisode(episodeId: string, seeds: SegmentDiveDeeperSeed[]): Promise<SegmentDiveDeeperSeed[]>;
  listForEpisode(episodeId: string): Promise<SegmentDiveDeeperSeed[]>;
  getById(seedId: string): Promise<SegmentDiveDeeperSeed | undefined>;
}

