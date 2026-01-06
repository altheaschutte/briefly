import { z } from 'zod';
import { episodeSpecSchema } from '../schema/episode-spec';
import { suggestionOutputSchema } from '../schema/topic-suggestion';

export const conversationOutcomeSchema = z.object({
  status: z.enum(['READY', 'NEEDS_USER_REPLY']),
  assistantMessage: z.string(),
  nextQuestion: z.string().nullable(),
  episodeSpec: episodeSpecSchema,
  signals: z.object({
    feedback: z
      .object({ type: z.string(), value: z.string() })
      .nullable()
      .optional(),
    settingsChange: z
      .object({ type: z.string(), value: z.string() })
      .nullable()
      .optional(),
  }),
  confidence: z.number(),
});

export const recencyClassificationSchema = z.object({
  domain: z.string(),
  cadence: z.enum(['FAST', 'MEDIUM', 'SLOW']),
  recencyTier: z.enum(['IMMEDIATE', 'RECENT', 'CURRENT', 'EVERGREEN']),
  rationale: z.string(),
  adjustedOutcome: conversationOutcomeSchema,
});

export const researchOutputSchema = z.object({
  executedQueries: z.array(z.string()),
  sourcesByQuery: z.array(
    z.object({
      query: z.string(),
      sources: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
          content: z.string(),
        }),
      ),
    }),
  ),
  factBank: z.array(z.string()),
  stitchedSummary: z.string(),
  segmentNotes: z.array(
    z.object({
      segmentId: z.string(),
      goal: z.string(),
      notes: z.string(),
    }),
  ),
  openQuestions: z.array(z.string()),
});

export const scriptOutputSchema = z.object({
  episodeTitle: z.string(),
  style: z.string(),
  durationMinutes: z.number(),
  paceWpm: z.number(),
  targetWordCount: z.number(),
  script: z.object({
    intro: z.string(),
    segments: z.array(
      z.object({
        segmentId: z.string(),
        title: z.string(),
        goal: z.string(),
        estimatedMinutes: z.number(),
        script: z.string(),
      }),
    ),
    outro: z.string(),
  }),
  showNotes: z.array(z.string()).max(2),
  openQuestions: z.array(z.string()),
});

export const topicSuggestionTraceSchema = z.object({
  calledAt: z.string(),
  suggestions: suggestionOutputSchema.shape.suggestions,
  rationale: z.string(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .optional(),
});

export const userProfileSchema = z.object({
  interests: z.array(z.string()),
  likes: z.array(z.string()),
  dislikes: z.array(z.string()),
  callbacksToLastEpisode: z.array(z.string()),
  moreOf: z.array(z.string()),
  lessOf: z.array(z.string()),
  recentSuggestions: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        domain: z.string().optional(),
        cadence: z.string().optional(),
        recencyTier: z.string().optional(),
      }),
    )
    .optional(),
  lastEpisodeTitle: z.string().optional(),
  entitlements: z
    .object({
      maxDurationMinutes: z.number().optional(),
      bufferMinutes: z.number().optional(),
      maxEpisodeMinutes: z.number().optional(),
      remainingMinutes: z.number().optional(),
    })
    .optional(),
});

export const emptyUserProfile: z.infer<typeof userProfileSchema> = {
  interests: [],
  likes: [],
  dislikes: [],
  callbacksToLastEpisode: [],
  moreOf: [],
  lessOf: [],
  recentSuggestions: [],
  lastEpisodeTitle: undefined,
  entitlements: undefined,
};

export const entitlementsSchema = z.object({
  maxDurationMinutes: z.number().optional(),
  bufferMinutes: z.number().optional(),
  maxEpisodeMinutes: z.number().optional(),
  remainingMinutes: z.number().optional(),
});

export const mergeList = (current: string[] = [], additions: string[] = []) =>
  Array.from(new Set([...current, ...additions.filter(Boolean)]));

export const mergeSuggestions = (
  current: NonNullable<z.infer<typeof userProfileSchema>['recentSuggestions']> = [],
  trace: Array<z.infer<typeof topicSuggestionTraceSchema>> = [],
) => {
  const flattened =
    trace?.flatMap((entry) =>
      entry.suggestions.map((s) => ({
        id: s.id,
        title: s.title,
        domain: s.domain,
        cadence: s.cadence,
        recencyTier: s.recencyTier,
      })),
    ) ?? [];

  const deduped = new Map<string, (typeof flattened)[number]>();
  [...current, ...flattened].forEach((item) => {
    if (item?.id && !deduped.has(item.id)) {
      deduped.set(item.id, item);
    }
  });

  return Array.from(deduped.values()).slice(-15);
};

export const summarizeUserProfile = (profile: z.infer<typeof userProfileSchema>) => {
  const parts = [];
  if (profile.interests.length > 0) parts.push(`Interests: ${profile.interests.join(', ')}`);
  if (profile.likes.length > 0) parts.push(`Likes: ${profile.likes.join(', ')}`);
  if (profile.dislikes.length > 0) parts.push(`Dislikes: ${profile.dislikes.join(', ')}`);
  if (profile.moreOf.length > 0) parts.push(`More of: ${profile.moreOf.join(', ')}`);
  if (profile.lessOf.length > 0) parts.push(`Less of: ${profile.lessOf.join(', ')}`);
  if (profile.callbacksToLastEpisode.length > 0)
    parts.push(`Callbacks: ${profile.callbacksToLastEpisode.join(', ')}`);
  if (profile.recentSuggestions && profile.recentSuggestions.length > 0) {
    const titles = profile.recentSuggestions.map((s) => s.title).slice(-5).join('; ');
    parts.push(`Recent suggestions: ${titles}`);
  }

  return parts.length > 0
    ? `User profile snapshot (personalization only): ${parts.join(' | ')}`
    : '';
};

export const summarizeEpisode = (
  outcome: z.infer<typeof conversationOutcomeSchema>,
  script: z.infer<typeof scriptOutputSchema>,
) => {
  const segmentLines = script.script.segments
    .map((seg) => `${seg.title} (${seg.goal}; ~${seg.estimatedMinutes}m)`)
    .join(' | ');
  const showNotes = script.showNotes.join('; ');
  return `Episode "${script.episodeTitle}" [${outcome.episodeSpec.timeframe}, ${outcome.episodeSpec.style}, ${outcome.episodeSpec.durationMinutes}m] segments: ${segmentLines}${
    showNotes ? ` | show notes: ${showNotes}` : ''
  }`;
};

export const truncate = (text: string, limit = 500) =>
  text.length > limit ? `${text.slice(0, limit)}…` : text;
