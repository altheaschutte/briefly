import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { EpisodeSegment } from '../domain/types';
import { EpisodeSegmentsRepository } from './episode-segments.repository';

@Injectable()
export class InMemoryEpisodeSegmentsRepository implements EpisodeSegmentsRepository {
  constructor(private readonly store: InMemoryStoreService) {}

  async replaceForEpisode(episodeId: string, segments: EpisodeSegment[]): Promise<EpisodeSegment[]> {
    const normalized = segments.map((segment, idx) => ({
      ...segment,
      id: segment.id ?? uuid(),
      episodeId,
      orderIndex: segment.orderIndex ?? idx,
    }));
    this.store.setSegments(episodeId, normalized);
    return normalized;
  }

  async listForEpisode(episodeId: string): Promise<EpisodeSegment[]> {
    return this.store.getSegments(episodeId);
  }
}
