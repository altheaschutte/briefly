import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Topic } from '../domain/types';
import { TOPICS_REPOSITORY, TopicListFilter, TopicsRepository } from './topics.repository';
import { EntitlementsService } from '../billing/entitlements.service';

@Injectable()
export class TopicsService {
  constructor(
    @Inject(TOPICS_REPOSITORY) private readonly repository: TopicsRepository,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  listTopics(userId: string, filter?: TopicListFilter): Promise<Topic[]> {
    return this.repository.listByUser(userId, filter);
  }

  async createTopic(userId: string, originalText: string): Promise<Topic> {
    const limit = await this.getActiveTopicLimit(userId);
    const activeCount = await this.countActiveTopics(userId);
    this.assertActiveTopicLimit(activeCount + 1, limit);
    const topic = await this.repository.create(userId, originalText);
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

    const limit = await this.getActiveTopicLimit(userId);
    const activeCount = await this.countActiveTopics(userId);
    const willBeActive = updates.isActive ?? topic.isActive;
    const nextActiveCount = willBeActive
      ? topic.isActive
        ? activeCount
        : activeCount + 1
      : topic.isActive
        ? Math.max(activeCount - 1, 0)
        : activeCount;

    const isIncreasingActiveCount = nextActiveCount > activeCount;
    if (isIncreasingActiveCount) {
      this.assertActiveTopicLimit(nextActiveCount, limit);
    }

    const updated = await this.repository.update(userId, topicId, {
      originalText: updates.originalText ?? topic.originalText,
      isActive: updates.isActive ?? topic.isActive,
      orderIndex: updates.orderIndex ?? topic.orderIndex,
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

  private async getActiveTopicLimit(userId: string): Promise<number> {
    const entitlements = await this.entitlementsService.getEntitlements(userId);
    return entitlements.limits.maxActiveTopics;
  }

  private async countActiveTopics(userId: string): Promise<number> {
    const topics = await this.repository.listByUser(userId);
    return topics.filter((t) => t.isActive).length;
  }

  private assertActiveTopicLimit(nextActiveCount: number, limit: number) {
    if (nextActiveCount > limit) {
      throw new BadRequestException(`Your plan allows up to ${limit} active topics.`);
    }
  }
}
