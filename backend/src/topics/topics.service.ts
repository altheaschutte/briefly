import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Topic } from '../domain/types';
import { TOPICS_REPOSITORY, TopicListFilter, TopicsRepository } from './topics.repository';

@Injectable()
export class TopicsService {
  private readonly maxActiveTopics = 5;

  constructor(@Inject(TOPICS_REPOSITORY) private readonly repository: TopicsRepository) {}

  listTopics(userId: string, filter?: TopicListFilter): Promise<Topic[]> {
    return this.repository.listByUser(userId, filter);
  }

  async createTopic(userId: string, originalText: string): Promise<Topic> {
    const topic = await this.repository.create(userId, originalText);
    await this.enforceActiveTopicLimit(userId);
    return topic;
  }

  async updateTopic(
    userId: string,
    topicId: string,
    updates: { originalText?: string; isActive?: boolean; orderIndex?: number },
  ): Promise<Topic> {
    const topic = await this.repository.getById(userId, topicId);
    if (!topic) {
      throw new NotFoundException('Topic not found');
    }
    const updated = await this.repository.update(userId, topicId, {
      originalText: updates.originalText ?? topic.originalText,
      isActive: updates.isActive ?? topic.isActive,
      orderIndex: updates.orderIndex ?? topic.orderIndex,
    });
    if (!updated) {
      throw new NotFoundException('Topic not found');
    }
    if (updated.isActive) {
      await this.enforceActiveTopicLimit(userId);
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

  /**
   * Ensure only the most recent maxActiveTopics remain active.
   */
  private async enforceActiveTopicLimit(userId: string): Promise<void> {
    const topics = await this.repository.listByUser(userId);
    const activeTopics = topics.filter((t) => t.isActive);
    if (activeTopics.length <= this.maxActiveTopics) {
      return;
    }

    const sortedByRecency = [...activeTopics].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const toDeactivate = sortedByRecency.slice(this.maxActiveTopics);

    for (const topic of toDeactivate) {
      await this.repository.update(userId, topic.id, { isActive: false });
    }
  }
}
