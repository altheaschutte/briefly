import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SegmentDiveDeeperSeed } from '../domain/types';
import {
  SEGMENT_DIVE_DEEPER_SEEDS_REPOSITORY,
  SegmentDiveDeeperSeedsRepository,
} from './segment-dive-deeper-seeds.repository';

@Injectable()
export class SegmentDiveDeeperSeedsService {
  constructor(
    @Inject(SEGMENT_DIVE_DEEPER_SEEDS_REPOSITORY)
    private readonly repository: SegmentDiveDeeperSeedsRepository,
  ) {}

  replaceSeeds(episodeId: string, seeds: SegmentDiveDeeperSeed[]): Promise<SegmentDiveDeeperSeed[]> {
    return this.repository.replaceForEpisode(episodeId, seeds);
  }

  listSeeds(episodeId: string): Promise<SegmentDiveDeeperSeed[]> {
    return this.repository.listForEpisode(episodeId);
  }

  getSeedById(seedId: string): Promise<SegmentDiveDeeperSeed | undefined> {
    return this.repository.getById(seedId);
  }

  async getSeedForEpisode(episodeId: string, seedId: string): Promise<SegmentDiveDeeperSeed> {
    const seed = await this.repository.getById(seedId);
    if (!seed || seed.episodeId !== episodeId) {
      throw new NotFoundException('Dive deeper seed not found');
    }
    return seed;
  }
}
