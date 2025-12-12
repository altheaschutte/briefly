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
    const normalized = sources
      .filter((source) => Boolean(source.url))
      .map((source) => {
        const url = source.url.trim();
        const key = url.toLowerCase();
        if (seen.has(key)) {
          return null;
        }
        seen.add(key);
        return {
          ...source,
          id: source.id ?? uuid(),
          episodeId: episodeId,
          sourceTitle: source.sourceTitle?.trim() || url,
          url,
        };
      })
      .filter((source): source is EpisodeSource => Boolean(source));

    return this.repository.replaceForEpisode(episodeId, normalized);
  }

  listSources(episodeId: string): Promise<EpisodeSource[]> {
    return this.repository.listForEpisode(episodeId);
  }
}
