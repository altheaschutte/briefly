import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { EpisodeSource } from '../domain/types';
import { EPISODE_SOURCES_REPOSITORY, EpisodeSourcesRepository } from './episode-sources.repository';

@Injectable()
export class EpisodeSourcesService {
  constructor(
    @Inject(EPISODE_SOURCES_REPOSITORY) private readonly repository: EpisodeSourcesRepository,
  ) {}

  async replaceSources(episodeId: string, sources: EpisodeSource[]): Promise<EpisodeSource[]> {
    const seen = new Set<string>();
    const normalized: EpisodeSource[] = [];

    for (const source of sources || []) {
      if (!source?.url) {
        continue;
      }
      const url = source.url.trim();
      if (!url) {
        continue;
      }
      const key = `${source.segmentId || 'episode'}::${url.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push({
        ...source,
        id: source.id ?? uuid(),
        episodeId,
        segmentId: source.segmentId,
        sourceTitle: source.sourceTitle?.trim() || url,
        url,
      });
    }

    return this.repository.replaceForEpisode(episodeId, normalized);
  }

  listSources(episodeId: string): Promise<EpisodeSource[]> {
    return this.repository.listForEpisode(episodeId);
  }
}
