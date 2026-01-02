export type ModelPricing = {
  inputUsdPer1M: number;
  outputUsdPer1M: number;
};

export type ModelPricingMap = Record<string, ModelPricing>;

export const MODEL_PRICING_USD_PER_1M: ModelPricingMap = {
  // Edit this file to update pricing (kept in-repo for easy review/history).
  'gpt-4.1': { inputUsdPer1M: 5, outputUsdPer1M: 15 },
  'gpt-4.1-mini': { inputUsdPer1M: 0.4, outputUsdPer1M: 1.6 },
  'gpt-4.1-nano': { inputUsdPer1M: 0.1, outputUsdPer1M: 0.4 },
  'gpt-4o': { inputUsdPer1M: 2.5, outputUsdPer1M: 10 },
  'gpt-4o-mini': { inputUsdPer1M: 0.15, outputUsdPer1M: 0.6 },
};

export function resolveModelPricing(model: string | undefined | null): ModelPricing | null {
  const normalized = (model || '').trim();
  if (!normalized) {
    return null;
  }

  if (MODEL_PRICING_USD_PER_1M[normalized]) {
    return MODEL_PRICING_USD_PER_1M[normalized];
  }

  const lower = normalized.toLowerCase();
  for (const [prefix, pricing] of Object.entries(MODEL_PRICING_USD_PER_1M)) {
    if (!prefix) {
      continue;
    }
    if (lower.startsWith(prefix.toLowerCase())) {
      return pricing;
    }
  }

  return null;
}

export function estimateUsdCostFromTokens(inputTokens: number, outputTokens: number, pricing: ModelPricing): number {
  const inputCost = (Math.max(0, inputTokens) / 1_000_000) * pricing.inputUsdPer1M;
  const outputCost = (Math.max(0, outputTokens) / 1_000_000) * pricing.outputUsdPer1M;
  return inputCost + outputCost;
}
