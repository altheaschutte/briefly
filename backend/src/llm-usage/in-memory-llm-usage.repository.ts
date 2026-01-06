import { LlmUsageRepository } from './llm-usage.repository';
import { LlmUsageRecord } from './llm-usage.types';

export class InMemoryLlmUsageRepository implements LlmUsageRepository {
  private readonly recordsByUser = new Map<string, LlmUsageRecord[]>();

  async create(record: LlmUsageRecord): Promise<void> {
    const list = this.recordsByUser.get(record.userId) ?? [];
    list.push({ ...record, createdAt: record.createdAt ?? new Date() });
    this.recordsByUser.set(record.userId, list);
  }

  async listByEpisode(userId: string, episodeId: string): Promise<LlmUsageRecord[]> {
    return (this.recordsByUser.get(userId) ?? []).filter((r) => r.episodeId === episodeId);
  }
}
