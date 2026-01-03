import { Inject, Injectable, Logger } from '@nestjs/common';
import { LlmUsageReporter } from '../llm/llm-usage';
import { estimateUsdCostFromTokens, resolveModelPricing } from './llm-pricing';
import { LlmUsageContextService } from './llm-usage.context';
import { LLM_USAGE_REPOSITORY, LlmUsageRepository } from './llm-usage.repository';
import { LlmUsageRecord, LlmUsageTotals } from './llm-usage.types';

@Injectable()
export class LlmUsageService implements LlmUsageReporter {
  private readonly logger = new Logger(LlmUsageService.name);

  constructor(
    private readonly context: LlmUsageContextService,
    @Inject(LLM_USAGE_REPOSITORY) private readonly repository: LlmUsageRepository,
  ) {}

  async record(event: Parameters<LlmUsageReporter['record']>[0]): Promise<void> {
    const ctx = this.context.get();
    const userId = ctx?.userId;
    if (!userId) {
      return;
    }

    const promptTokens = event.usage?.promptTokens ?? undefined;
    const completionTokens = event.usage?.completionTokens ?? undefined;
    const totalTokens = event.usage?.totalTokens ?? undefined;

    const pricing = resolveModelPricing(event.model);
    const tokenCostUsd =
      pricing && Number.isFinite(promptTokens) && Number.isFinite(completionTokens)
        ? estimateUsdCostFromTokens(
            promptTokens as number,
            completionTokens as number,
            pricing,
            typeof event.usage?.cachedPromptTokens === 'number' ? event.usage.cachedPromptTokens : undefined,
          )
        : null;
    const costUsd = event.costUsd !== undefined ? event.costUsd : tokenCostUsd;

    const record: LlmUsageRecord = {
      userId,
      episodeId: ctx?.episodeId,
      topicId: ctx?.topicId,
      segmentId: ctx?.segmentId,
      flow: ctx?.flow,
      operation: event.operation,
      provider: event.provider,
      model: event.model,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      usage: event.usage?.raw,
    };

    this.logger.debug(
      `LLM usage: op=${record.operation} model=${record.model || 'unknown'} tokens=${record.totalTokens ?? 'n/a'} costUsd=${
        record.costUsd ?? 'n/a'
      } episode=${record.episodeId ?? '-'} topic=${record.topicId ?? '-'}`,
    );

    try {
      await this.repository.create(record);
    } catch (error) {
      this.logger.warn(`Failed to persist LLM usage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getEpisodeTotals(userId: string, episodeId: string): Promise<LlmUsageTotals> {
    const records = await this.repository.listByEpisode(userId, episodeId);
    return this.summarize(records);
  }

  async getTopicTotals(userId: string, topicId: string): Promise<LlmUsageTotals> {
    const records = await this.repository.listByTopic(userId, topicId);
    return this.summarize(records);
  }

  private summarize(records: LlmUsageRecord[]): LlmUsageTotals {
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let costUsdKnown = 0;
    let costUsdUnknownCount = 0;

    for (const record of records) {
      promptTokens += record.promptTokens ?? 0;
      completionTokens += record.completionTokens ?? 0;
      totalTokens += record.totalTokens ?? 0;
      if (typeof record.costUsd === 'number') {
        costUsdKnown += record.costUsd;
      } else {
        costUsdUnknownCount += 1;
      }
    }

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      costUsdKnown,
      costUsdUnknownCount,
      costUsd: costUsdUnknownCount ? null : costUsdKnown,
      eventCount: records.length,
    };
  }
}
