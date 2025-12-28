import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { Topic } from '../domain/types';
import { TopicListFilter, TopicUpdateInput, TopicsRepository } from './topics.repository';

@Injectable()
export class InMemoryTopicsRepository implements TopicsRepository {
  constructor(private readonly store: InMemoryStoreService) {}

  async listByUser(userId: string, filter?: TopicListFilter): Promise<Topic[]> {
    const topics = this.store.getTopics(userId);
    if (filter?.isActive === undefined) {
      return topics;
    }
    return topics.filter((topic) => topic.isActive === filter.isActive);
  }

  async getById(userId: string, topicId: string): Promise<Topic | undefined> {
    return this.store.getTopics(userId).find((t) => t.id === topicId);
  }

  async create(
    userId: string,
    originalText: string,
    options?: { isSeed?: boolean; isActive?: boolean },
  ): Promise<Topic> {
    const now = new Date();
    const existing = await this.listByUser(userId);
    const nextOrder = existing.length ? Math.max(...existing.map((t) => t.orderIndex)) + 1 : 0;
    const topic: Topic = {
      id: uuid(),
      userId,
      originalText,
      orderIndex: nextOrder,
      isActive: options?.isActive ?? true,
      isSeed: options?.isSeed ?? false,
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
      orderIndex: updates.orderIndex,
    });
  }
}
