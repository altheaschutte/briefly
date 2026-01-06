import { BillingTier } from './billing.types';

export const STRIPE_PRICE_MAP: Partial<Record<BillingTier, string>> = {
  // Populate with your live/preview price IDs
  free: '',
  starter: 'price_1SjqkvDEgK5QHLxoAam8nvJa',
  pro: 'price_1Sjql1DEgK5QHLxoDlztFs2T',
  power: 'price_1Sjql8DEgK5QHLxoagfTRZ0O',
};
