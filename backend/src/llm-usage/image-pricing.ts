export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024';
export type ImageQuality = 'low' | 'medium' | 'high';

export type ImagePricingPerOutput = Partial<Record<ImageSize, Partial<Record<ImageQuality, number>>>>;
export type ImageModelPricing = {
  usdPerImageOutput?: ImagePricingPerOutput;
  usdPerImageFlat?: number;
};

const IMAGE_MODEL_PRICING: Record<string, ImageModelPricing> = {
  // OpenAI pricing (Image generation → Prices per image).
  'gpt-image-1': {
    usdPerImageOutput: {
      '1024x1024': { low: 0.011, medium: 0.042, high: 0.167 },
      '1024x1536': { low: 0.016, medium: 0.063, high: 0.25 },
      '1536x1024': { low: 0.016, medium: 0.063, high: 0.25 },
    },
  },

  // xAI pricing table (Image generation models → Per image output).
  'grok-2-image-1212': { usdPerImageFlat: 0.07 },
};

export function estimateImageCostUsd(input: {
  model: string | undefined | null;
  count?: number;
  size?: string | undefined;
  quality?: string | undefined;
}): number | null {
  const model = (input.model || '').trim();
  if (!model) {
    return null;
  }
  const count = Math.max(1, Number(input.count ?? 1) || 1);
  const pricing = resolveImageModelPricing(model);
  if (!pricing) {
    return null;
  }

  if (typeof pricing.usdPerImageFlat === 'number') {
    return pricing.usdPerImageFlat * count;
  }

  const size = normalizeImageSize(input.size);
  const quality = normalizeImageQuality(input.quality);
  if (!size || !quality) {
    return null;
  }
  const perImage = pricing.usdPerImageOutput?.[size]?.[quality];
  if (typeof perImage !== 'number') {
    return null;
  }
  return perImage * count;
}

function resolveImageModelPricing(model: string): ImageModelPricing | null {
  if (IMAGE_MODEL_PRICING[model]) {
    return IMAGE_MODEL_PRICING[model];
  }
  const lower = model.toLowerCase();
  for (const [prefix, pricing] of Object.entries(IMAGE_MODEL_PRICING)) {
    if (lower.startsWith(prefix.toLowerCase())) {
      return pricing;
    }
  }
  return null;
}

function normalizeImageSize(raw: string | undefined): ImageSize | null {
  const normalized = (raw || '').trim().toLowerCase();
  if (normalized === '1024x1024' || normalized === '1024x1536' || normalized === '1536x1024') {
    return normalized as ImageSize;
  }
  return null;
}

function normalizeImageQuality(raw: string | undefined): ImageQuality | null {
  const normalized = (raw || '').trim().toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized as ImageQuality;
  }
  return null;
}

