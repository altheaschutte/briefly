export type ModelPricing = {
  inputUsdPer1M: number;
  cachedInputUsdPer1M?: number;
  outputUsdPer1M: number;
};

export type ModelPricingMap = Record<string, ModelPricing>;

export const MODEL_PRICING_USD_PER_1M: ModelPricingMap = {
  // Edit this file to update pricing (kept in-repo for easy review/history).
  // OpenAI pricing is the "Standard" tier from the pricing page.
  'gpt-4.1': { inputUsdPer1M: 2.0, cachedInputUsdPer1M: 0.5, outputUsdPer1M: 8.0 },
  'gpt-4.1-mini': { inputUsdPer1M: 0.4, cachedInputUsdPer1M: 0.1, outputUsdPer1M: 1.6 },
  'gpt-4.1-nano': { inputUsdPer1M: 0.1, cachedInputUsdPer1M: 0.025, outputUsdPer1M: 0.4 },
  'gpt-4o': { inputUsdPer1M: 2.5, cachedInputUsdPer1M: 1.25, outputUsdPer1M: 10.0 },
  'gpt-4o-mini': { inputUsdPer1M: 0.15, cachedInputUsdPer1M: 0.075, outputUsdPer1M: 0.6 },

  // xAI (Grok) pricing (per 1M tokens) from docs.x.ai model table.
  'grok-4-0709': { inputUsdPer1M: 3.0, outputUsdPer1M: 15.0 },
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

export function estimateUsdCostFromTokens(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
  cachedInputTokens?: number,
): number {
  const totalInputTokens = Math.max(0, inputTokens);
  const cachedTokens = Math.max(0, cachedInputTokens ?? 0);
  const uncachedTokens = Math.max(0, totalInputTokens - cachedTokens);

  const cachedRate = pricing.cachedInputUsdPer1M ?? pricing.inputUsdPer1M;
  const inputCost = (uncachedTokens / 1_000_000) * pricing.inputUsdPer1M;
  const cachedCost = (cachedTokens / 1_000_000) * cachedRate;
  const outputCost = (Math.max(0, outputTokens) / 1_000_000) * pricing.outputUsdPer1M;
  return inputCost + cachedCost + outputCost;
}
