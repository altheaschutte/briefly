import { Injectable } from '@nestjs/common';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { EpisodeSource } from '../domain/types';
import { EpisodeSourcesRepository } from './episode-sources.repository';

@Injectable()
export class InMemoryEpisodeSourcesRepository implements EpisodeSourcesRepository {
  constructor(private readonly store: InMemoryStoreService) {}

  async replaceForEpisode(episodeId: string, sources: EpisodeSource[]): Promise<EpisodeSource[]> {
    this.store.setSources(episodeId, sources);
    return sources;
  }

  async listForEpisode(episodeId: string): Promise<EpisodeSource[]> {
    return this.store.getSources(episodeId);
  }
}
