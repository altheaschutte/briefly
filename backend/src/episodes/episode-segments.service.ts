import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { EpisodeSegment } from '../domain/types';
import { EPISODE_SEGMENTS_REPOSITORY, EpisodeSegmentsRepository } from './episode-segments.repository';

@Injectable()
export class EpisodeSegmentsService {
  constructor(
    @Inject(EPISODE_SEGMENTS_REPOSITORY) private readonly repository: EpisodeSegmentsRepository,
  ) {}

  async replaceSegments(episodeId: string, segments: EpisodeSegment[]): Promise<EpisodeSegment[]> {
    const ordered = [...segments].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    let runningStartSeconds = 0;

    const normalized = ordered.map((segment, idx) => {
      const id = segment.id ?? uuid();
      const startTimeSeconds =
        segment.startTimeSeconds !== undefined && segment.startTimeSeconds !== null
          ? segment.startTimeSeconds
          : runningStartSeconds;
      const durationSeconds = segment.durationSeconds ?? undefined;
      const rawSources = (segment.rawSources || [])
        .map((source) => {
          const url = (source.url || '').trim();
          if (!url) {
            return null;
          }
          return {
            ...source,
            id: source.id ?? uuid(),
            episodeId,
            segmentId: source.segmentId ?? id,
            title: source.title ?? source.sourceTitle ?? url,
            sourceTitle: source.sourceTitle?.trim() || url,
            url,
          };
        })
        .filter((source): source is NonNullable<typeof source> => Boolean(source));

      runningStartSeconds = startTimeSeconds + (durationSeconds ?? 0);

      return {
        ...segment,
        id,
        episodeId,
        orderIndex: segment.orderIndex ?? idx,
        startTimeSeconds,
        durationSeconds,
        rawSources,
        segmentType: segment.segmentType ?? 'body',
      };
    });

    return this.repository.replaceForEpisode(episodeId, normalized);
  }

  listSegments(episodeId: string): Promise<EpisodeSegment[]> {
    return this.repository.listForEpisode(episodeId);
  }
}
