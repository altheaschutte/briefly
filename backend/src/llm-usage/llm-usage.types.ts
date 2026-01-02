export type LlmUsageRecord = {
  userId: string;
  episodeId?: string;
  topicId?: string;
  segmentId?: string;
  flow?: string;
  operation: string;
  provider?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number | null;
  usage?: unknown;
  createdAt?: Date;
};

export type LlmUsageTotals = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number | null;
  costUsdKnown: number;
  costUsdUnknownCount: number;
  eventCount: number;
};

