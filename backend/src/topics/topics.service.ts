import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SegmentDiveDeeperSeed, Topic } from '../domain/types';
import { TOPICS_REPOSITORY, TopicListFilter, TopicsRepository } from './topics.repository';
import { EntitlementsService } from '../billing/entitlements.service';
import { LlmService } from '../llm/llm.service';
import { LlmUsageContextService } from '../llm-usage/llm-usage.context';

@Injectable()
export class TopicsService {
  constructor(
    @Inject(TOPICS_REPOSITORY) private readonly repository: TopicsRepository,
    private readonly entitlementsService: EntitlementsService,
    private readonly llmService: LlmService,
    private readonly llmUsageContext: LlmUsageContextService,
  ) {}

  listTopics(userId: string, filter?: TopicListFilter): Promise<Topic[]> {
    return this.repository.listByUser(userId, filter);
  }

  async getDiveDeeperTopicForSeed(userId: string, seedId: string): Promise<Topic> {
    const topics = await this.repository.listByUser(userId, {
      includeSystemGenerated: true,
      segmentDiveDeeperSeedId: seedId,
    });
    const topic = topics[0];
    if (!topic) {
      throw new NotFoundException('Dive deeper topic not found');
    }
    return topic;
  }

  async createTopic(
    userId: string,
    originalText: string,
    options?: { isSeed?: boolean; isActive?: boolean },
  ): Promise<Topic> {
    const trimmedOriginalText = (originalText || '').trim();
    if (!trimmedOriginalText) {
      throw new BadRequestException('original_text is required');
    }

    const willBeActive = options?.isActive ?? true;
    if (willBeActive) {
      const limit = await this.getActiveTopicLimit(userId);
      const activeCount = await this.countActiveTopics(userId);
      this.assertActiveTopicLimit(activeCount + 1, limit);
    }

    const provisionalTitle = this.buildTopicTitleFallback(trimmedOriginalText) || null;
    let topic = await this.repository.create(userId, trimmedOriginalText, {
      title: provisionalTitle,
      isSeed: options?.isSeed ?? false,
      isActive: options?.isActive ?? true,
    });
    const generatedTitle = await this.llmUsageContext.run(
      { userId, topicId: topic.id, flow: 'topic_creation' },
      async () => this.generateTopicTitle(trimmedOriginalText),
    );
    if (generatedTitle && generatedTitle !== topic.title) {
      topic = (await this.repository.update(userId, topic.id, { title: generatedTitle })) ?? topic;
    }
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
    if (topic.segmentDiveDeeperSeedId) {
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

    const nextOriginalTextRaw = updates.originalText ?? topic.originalText;
    const nextOriginalText = (nextOriginalTextRaw || '').trim();
    if (!nextOriginalText) {
      throw new BadRequestException('original_text cannot be empty');
    }
    const shouldRegenerateTitle =
      updates.originalText !== undefined &&
      this.normalizeTopicText(nextOriginalText) !== this.normalizeTopicText(topic.originalText);

    const nextTitle = shouldRegenerateTitle
      ? await this.llmUsageContext.run({ userId, topicId, flow: 'topic_update' }, async () =>
          this.generateTopicTitle(nextOriginalText),
        )
      : undefined;
    const updated = await this.repository.update(userId, topicId, {
      title: nextTitle,
      originalText: nextOriginalText,
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
    if (topic.segmentDiveDeeperSeedId) {
      throw new NotFoundException('Topic not found');
    }
    const updated = await this.repository.update(userId, topicId, { isActive: false });
    if (!updated) {
      throw new NotFoundException('Topic not found');
    }
    return updated;
  }

  async getOrCreateDiveDeeperTopic(userId: string, seed: SegmentDiveDeeperSeed): Promise<Topic> {
    const existing = await this.repository.listByUser(userId, {
      includeSystemGenerated: true,
      segmentDiveDeeperSeedId: seed.id,
    });
    if (existing.length) {
      return existing[0];
    }
    try {
      return await this.repository.create(userId, seed.title, {
        title: this.buildTopicTitleFallback(seed.title),
        isSeed: false,
        isActive: true,
        segmentDiveDeeperSeedId: seed.id,
        contextBundle: seed.contextBundle ?? {},
      });
    } catch (error) {
      const after = await this.repository.listByUser(userId, {
        includeSystemGenerated: true,
        segmentDiveDeeperSeedId: seed.id,
      });
      if (after.length) {
        return after[0];
      }
      throw error;
    }
  }

  async generateSeedTopics(userId: string, userInsight: string): Promise<Topic[]> {
    const trimmedInsight = (userInsight || '').trim();
    if (!trimmedInsight) {
      throw new BadRequestException('user_about_context is required');
    }

    const limit = await this.getActiveTopicLimit(userId);
    const existing = await this.repository.listByUser(userId);
    const activeCount = existing.filter((t) => t.isActive).length;
    const availableSlots = Math.max(0, limit - activeCount);
    if (!availableSlots) {
      throw new BadRequestException(`You already have ${limit} active topics. Remove one to add more.`);
    }

    const suggestions = await this.llmUsageContext.run({ userId, flow: 'topic_creation' }, async () =>
      this.llmService.generateSeedTopics(trimmedInsight),
    );
    const normalizedExisting = new Set(existing.map((t) => this.normalizeTopicText(t.originalText)));
    const seen = new Set(normalizedExisting);
    const deduped = suggestions
      .map((suggestion) => suggestion.trim())
      .filter(Boolean)
      .map((suggestion) => suggestion.replace(/^["'\s]+|["'\s]+$/g, ''))
      .filter((suggestion) => {
        const normalized = this.normalizeTopicText(suggestion);
        if (normalized.length <= 2 || seen.has(normalized)) {
          return false;
        }
        seen.add(normalized);
        return true;
      });

    const toCreate = deduped.slice(0, availableSlots);
    const created: Topic[] = [];
    for (const brief of toCreate) {
      const topic = await this.createTopic(userId, brief, { isSeed: true, isActive: true });
      created.push(topic);
    }

    return this.repository.listByUser(userId);
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

  private normalizeTopicText(text: string): string {
    return (text || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private async generateTopicTitle(originalText: string): Promise<string | null> {
    const trimmed = (originalText || '').trim();
    if (!trimmed) {
      return null;
    }
    try {
      const meta = await this.llmService.generateTopicMeta(trimmed);
      const normalized = this.buildTopicTitleFallback(meta?.title || '');
      return normalized || this.buildTopicTitleFallback(trimmed) || null;
    } catch {
      return this.buildTopicTitleFallback(trimmed) || null;
    }
  }

  private buildTopicTitleFallback(text: string): string {
    const cleaned = (text || '')
      .trim()
      .replace(/^["'\s]+|["'\s]+$/g, '')
      .replace(/[^\p{L}\p{N}\s'’\-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) {
      return '';
    }
    return cleaned.split(' ').filter(Boolean).slice(0, 3).join(' ');
  }
}
