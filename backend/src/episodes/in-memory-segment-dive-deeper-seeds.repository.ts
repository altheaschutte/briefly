import { SegmentDiveDeeperSeed } from '../domain/types';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { SegmentDiveDeeperSeedsRepository } from './segment-dive-deeper-seeds.repository';

export class InMemorySegmentDiveDeeperSeedsRepository implements SegmentDiveDeeperSeedsRepository {
  constructor(private readonly store: InMemoryStoreService) {}

  async replaceForEpisode(episodeId: string, seeds: SegmentDiveDeeperSeed[]): Promise<SegmentDiveDeeperSeed[]> {
    this.store.setDiveDeeperSeeds(episodeId, seeds);
    return seeds;
  }

  async listForEpisode(episodeId: string): Promise<SegmentDiveDeeperSeed[]> {
    return this.store.getDiveDeeperSeeds(episodeId);
  }

  async getById(seedId: string): Promise<SegmentDiveDeeperSeed | undefined> {
    return this.store.getDiveDeeperSeedById(seedId);
  }
}

