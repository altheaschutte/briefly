import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { Topic } from '../domain/types';
import { TopicUpdateInput, TopicsRepository } from './topics.repository';

@Injectable()
export class InMemoryTopicsRepository implements TopicsRepository {
  constructor(private readonly store: InMemoryStoreService) {}

  async listByUser(userId: string): Promise<Topic[]> {
    return this.store.getTopics(userId);
  }

  async getById(userId: string, topicId: string): Promise<Topic | undefined> {
    return this.store.getTopics(userId).find((t) => t.id === topicId);
  }

  async create(userId: string, originalText: string): Promise<Topic> {
    const now = new Date();
    const topic: Topic = {
      id: uuid(),
      userId,
      originalText,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.store.saveTopic(topic);
    return topic;
  }

  async update(userId: string, topicId: string, updates: TopicUpdateInput): Promise<Topic | undefined> {
    return this.store.updateTopic(userId, topicId, {
      originalText: updates.originalText,
      isActive: updates.isActive,
      rewrittenQuery: updates.rewrittenQuery,
    });
  }
}
