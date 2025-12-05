import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { Topic } from '../domain/types';

@Injectable()
export class TopicsService {
  constructor(private readonly store: InMemoryStoreService) {}

  listTopics(userId: string): Topic[] {
    return this.store.getTopics(userId);
  }

  createTopic(userId: string, originalText: string): Topic {
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

  updateTopic(
    userId: string,
    topicId: string,
    updates: { originalText?: string; isActive?: boolean },
  ): Topic {
    const topic = this.store.getTopics(userId).find((t) => t.id === topicId);
    if (!topic) {
      throw new NotFoundException('Topic not found');
    }
    const updated = this.store.updateTopic(userId, topicId, {
      originalText: updates.originalText ?? topic.originalText,
      isActive: updates.isActive ?? topic.isActive,
    });
    if (!updated) {
      throw new NotFoundException('Topic not found');
    }
    return updated;
  }

  softDeleteTopic(userId: string, topicId: string): Topic {
    const topic = this.store.getTopics(userId).find((t) => t.id === topicId);
    if (!topic) {
      throw new NotFoundException('Topic not found');
    }
    const updated = this.store.updateTopic(userId, topicId, { isActive: false });
    if (!updated) {
      throw new NotFoundException('Topic not found');
    }
    return updated;
  }
}
