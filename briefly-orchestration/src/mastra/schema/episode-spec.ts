import { z } from "zod";

export const episodeSpecSchema = z.object({
  episodeTitle: z.string(),
  listenerIntent: z.string(),          // what user wants *this time*
  timeframe: z.enum(["today", "this_week", "this_month"]),
  durationMinutes: z.number().min(5).max(60),
  style: z.enum([
    "EVERGREEN_NARRATIVE",
    "EXPLAINER_DEEP_DIVE",
    "BREAKING_RECENT_DEVELOPMENTS",
    "HEADLINES_DIGEST",
    "LOCAL_TIME_BOUND_EVENTS",
    "OPINION_SPECTRUM_PERSPECTIVE_BALANCE",
    "TREND_PATTERN_ANALYSIS",
    "PRACTICAL_GUIDANCE_HOW_TO",
    "CREATIVE_EXPLORATORY",
]),
  segments: z.array(z.object({
    id: z.string(),
    goal: z.string(),
    minutes: z.number().min(1).max(30),
   
  })),

  research: z.object({
    needed: z.boolean(),
    queries: z.array(z.string()),
  }).strict(),

  personalization: z.object({
    callbacksToLastEpisode: z.array(z.string()),
    moreOf: z.array(z.string()),
    lessOf: z.array(z.string()),
  }).strict(),
}).strict();
