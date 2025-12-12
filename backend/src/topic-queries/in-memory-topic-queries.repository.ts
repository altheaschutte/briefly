import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { TopicQuery } from '../domain/types';
import { TopicQueriesRepository, TopicQueryCreateInput } from './topic-queries.repository';

@Injectable()
export class InMemoryTopicQueriesRepository implements TopicQueriesRepository {
  constructor(private readonly store: InMemoryStoreService) {}

  async listByTopic(userId: string, topicId: string): Promise<TopicQuery[]> {
    return this.store.getTopicQueries(topicId).filter((query) => query.userId === userId);
  }

  async listByEpisode(userId: string, episodeId: string): Promise<TopicQuery[]> {
    return this.store.getTopicQueriesForEpisode(episodeId).filter((query) => query.userId === userId);
  }

  async createMany(userId: string, inputs: TopicQueryCreateInput[]): Promise<TopicQuery[]> {
    const now = new Date();
    const created = inputs.map((input) => ({
      id: uuid(),
      userId,
      topicId: input.topicId,
      episodeId: input.episodeId,
      query: input.query,
      answer: input.answer,
      citations: [...(input.citations || [])],
      orderIndex: input.orderIndex,
      createdAt: now,
      updatedAt: now,
    }));
    this.store.saveTopicQueries(created);
    return created;
  }
}
