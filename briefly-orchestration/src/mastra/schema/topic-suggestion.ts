import { z } from 'zod';

export const suggestionOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  domain: z.string(),
  cadence: z.enum(['FAST', 'MEDIUM', 'SLOW']),
  recencyTier: z.enum(['IMMEDIATE', 'RECENT', 'CURRENT', 'EVERGREEN']),
  timeframe: z.enum(['today', 'this_week', 'this_month']),
  styleHint: z.string(),
});

export const suggestionOutputSchema = z.object({
  suggestions: z.array(suggestionOptionSchema).min(2).max(3),
  rationale: z.string(),
});
