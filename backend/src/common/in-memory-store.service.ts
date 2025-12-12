import { Injectable } from '@nestjs/common';
import { Episode, EpisodeSegment, EpisodeSource, OnboardingTranscript, Topic, TopicQuery } from '../domain/types';

@Injectable()
export class InMemoryStoreService {
  private readonly topicsByUser: Map<string, Topic[]> = new Map();
  private readonly episodesByUser: Map<string, Episode[]> = new Map();
  private readonly segmentsByEpisode: Map<string, EpisodeSegment[]> = new Map();
  private readonly sourcesByEpisode: Map<string, EpisodeSource[]> = new Map();
  private readonly onboardingByUser: Map<string, OnboardingTranscript[]> = new Map();
  private readonly topicQueriesByTopic: Map<string, TopicQuery[]> = new Map();
  private readonly topicQueriesByEpisode: Map<string, TopicQuery[]> = new Map();

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

  getTopicQueries(topicId: string): TopicQuery[] {
    return this.topicQueriesByTopic.get(topicId) ?? [];
  }

  getTopicQueriesForEpisode(episodeId: string): TopicQuery[] {
    return this.topicQueriesByEpisode.get(episodeId) ?? [];
  }

  saveTopicQueries(queries: TopicQuery[]): TopicQuery[] {
    for (const query of queries) {
      const topicList = this.topicQueriesByTopic.get(query.topicId) ?? [];
      const topicIdx = topicList.findIndex((q) => q.id === query.id);
      if (topicIdx >= 0) {
        topicList[topicIdx] = query;
      } else {
        topicList.push(query);
      }
      this.topicQueriesByTopic.set(query.topicId, topicList);

      const episodeList = this.topicQueriesByEpisode.get(query.episodeId) ?? [];
      const episodeIdx = episodeList.findIndex((q) => q.id === query.id);
      if (episodeIdx >= 0) {
        episodeList[episodeIdx] = query;
      } else {
        episodeList.push(query);
      }
      this.topicQueriesByEpisode.set(query.episodeId, episodeList);
    }
    return queries;
  }

  getOnboardingTranscripts(userId: string): OnboardingTranscript[] {
    return this.onboardingByUser.get(userId) ?? [];
  }

  getOnboardingTranscript(userId: string, recordId: string): OnboardingTranscript | undefined {
    return this.getOnboardingTranscripts(userId).find((t) => t.id === recordId);
  }

  saveOnboardingTranscript(record: OnboardingTranscript): OnboardingTranscript {
    const list = this.onboardingByUser.get(record.userId) ?? [];
    const idx = list.findIndex((t) => t.id === record.id);
    if (idx >= 0) {
      list[idx] = record;
    } else {
      list.push(record);
    }
    this.onboardingByUser.set(record.userId, list);
    return record;
  }

  updateOnboardingTranscript(
    userId: string,
    recordId: string,
    updates: Partial<OnboardingTranscript>,
  ): OnboardingTranscript | undefined {
    const list = this.onboardingByUser.get(userId);
    if (!list) {
      return undefined;
    }
    const idx = list.findIndex((t) => t.id === recordId);
    if (idx === -1) {
      return undefined;
    }
    const updated: OnboardingTranscript = { ...list[idx], ...updates, updatedAt: new Date() };
    list[idx] = updated;
    this.onboardingByUser.set(userId, list);
    return updated;
  }
}
