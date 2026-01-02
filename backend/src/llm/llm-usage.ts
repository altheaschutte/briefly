export type LlmTokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  raw?: unknown;
};

export type LlmUsageEvent = {
  operation: string;
  provider?: string;
  model?: string;
  usage: LlmTokenUsage;
};

export interface LlmUsageReporter {
  record(event: LlmUsageEvent): Promise<void> | void;
}

