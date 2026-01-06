import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type LlmUsageContext = {
  userId: string;
  flow?: 'episode_generation' | 'other';
  episodeId?: string;
  segmentId?: string;
};

@Injectable()
export class LlmUsageContextService {
  private readonly storage = new AsyncLocalStorage<LlmUsageContext>();

  run<T>(next: Partial<LlmUsageContext>, fn: () => Promise<T>): Promise<T> {
    const current = this.storage.getStore();
    const merged = { ...(current || ({} as LlmUsageContext)), ...(next || {}) } as LlmUsageContext;
    return this.storage.run(merged, fn);
  }

  get(): LlmUsageContext | undefined {
    return this.storage.getStore();
  }
}
