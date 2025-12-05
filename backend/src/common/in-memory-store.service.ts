import { Injectable } from '@nestjs/common';
import { Episode, EpisodeSegment, EpisodeSource, Topic } from '../domain/types';

@Injectable()
export class InMemoryStoreService {
  private readonly topicsByUser: Map<string, Topic[]> = new Map();
  private readonly episodesByUser: Map<string, Episode[]> = new Map();
  private readonly segmentsByEpisode: Map<string, EpisodeSegment[]> = new Map();
  private readonly sourcesByEpisode: Map<string, EpisodeSource[]> = new Map();

  getTopics(userId: string): Topic[] {
    return this.topicsByUser.get(userId) ?? [];
  }

  saveTopic(topic: Topic): Topic {
    const list = this.topicsByUser.get(topic.userId) ?? [];
    const idx = list.findIndex((t) => t.id === topic.id);
    if (idx >= 0) {
      list[idx] = topic;
    } else {
      list.push(topic);
    }
    this.topicsByUser.set(topic.userId, list);
    return topic;
  }

  updateTopic(userId: string, topicId: string, updates: Partial<Topic>): Topic | undefined {
    const list = this.topicsByUser.get(userId);
    if (!list) {
      return undefined;
    }
    const idx = list.findIndex((t) => t.id === topicId);
    if (idx === -1) {
      return undefined;
    }
    const updated: Topic = { ...list[idx], ...updates, updatedAt: new Date() };
    list[idx] = updated;
    this.topicsByUser.set(userId, list);
    return updated;
  }

  getEpisodes(userId: string): Episode[] {
    return this.episodesByUser.get(userId) ?? [];
  }

  getEpisode(userId: string, episodeId: string): Episode | undefined {
    return this.getEpisodes(userId).find((e) => e.id === episodeId);
  }

  saveEpisode(episode: Episode): Episode {
    const list = this.episodesByUser.get(episode.userId) ?? [];
    const idx = list.findIndex((e) => e.id === episode.id);
    if (idx >= 0) {
      list[idx] = episode;
    } else {
      list.push(episode);
    }
    this.episodesByUser.set(episode.userId, list);
    return episode;
  }

  setSegments(episodeId: string, segments: EpisodeSegment[]): EpisodeSegment[] {
    this.segmentsByEpisode.set(episodeId, segments);
    return segments;
  }

  getSegments(episodeId: string): EpisodeSegment[] {
    return this.segmentsByEpisode.get(episodeId) ?? [];
  }

  setSources(episodeId: string, sources: EpisodeSource[]): EpisodeSource[] {
    this.sourcesByEpisode.set(episodeId, sources);
    return sources;
  }

  getSources(episodeId: string): EpisodeSource[] {
    return this.sourcesByEpisode.get(episodeId) ?? [];
  }
}
