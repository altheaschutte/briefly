export type LlmTokenUsage = {
  promptTokens?: number;
  cachedPromptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  raw?: unknown;
};

export type LlmUsageEvent = {
  operation: string;
  provider?: string;
  model?: string;
  usage: LlmTokenUsage;
  costUsd?: number | null;
};

export interface LlmUsageReporter {
  record(event: LlmUsageEvent): Promise<void> | void;
}
