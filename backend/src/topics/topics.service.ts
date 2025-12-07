import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Topic } from '../domain/types';
import { TOPICS_REPOSITORY, TopicsRepository } from './topics.repository';

@Injectable()
export class TopicsService {
  constructor(@Inject(TOPICS_REPOSITORY) private readonly repository: TopicsRepository) {}

  listTopics(userId: string): Promise<Topic[]> {
    return this.repository.listByUser(userId);
  }

  async createTopic(userId: string, originalText: string): Promise<Topic> {
    return this.repository.create(userId, originalText);
  }

  async updateTopic(
    userId: string,
    topicId: string,
    updates: { originalText?: string; isActive?: boolean },
  ): Promise<Topic> {
    const topic = await this.repository.getById(userId, topicId);
    if (!topic) {
      throw new NotFoundException('Topic not found');
    }
    const updated = await this.repository.update(userId, topicId, {
      originalText: updates.originalText ?? topic.originalText,
      isActive: updates.isActive ?? topic.isActive,
    });
    if (!updated) {
      throw new NotFoundException('Topic not found');
    }
    return updated;
  }

  async softDeleteTopic(userId: string, topicId: string): Promise<Topic> {
    const topic = await this.repository.getById(userId, topicId);
    if (!topic) {
      throw new NotFoundException('Topic not found');
    }
    const updated = await this.repository.update(userId, topicId, { isActive: false });
    if (!updated) {
      throw new NotFoundException('Topic not found');
    }
    return updated;
  }

  async setRewrittenQuery(userId: string, topicId: string, rewrittenQuery: string): Promise<Topic> {
    const topic = await this.repository.getById(userId, topicId);
    if (!topic) {
      throw new NotFoundException('Topic not found');
    }
    const updated = await this.repository.update(userId, topicId, { rewrittenQuery });
    if (!updated) {
      throw new NotFoundException('Topic not found');
    }
    return updated;
  }
}
