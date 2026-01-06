import { createWorkflow, createStep } from '@mastra/core/workflows';
import type { MastraMessageV1 } from '@mastra/core/memory';
import { Memory } from '@mastra/memory';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { audioRewriterAgent } from '../agents/audioRewriterAgent';
import { recencyClassifierAgent } from '../agents/recencyClassifierAgent';
import { researchAgent } from '../agents/researchAgent';
import { scriptWriterAgent } from '../agents/scriptWriterAgent';
import { episodeSpecSchema } from '../schema/episode-spec';
import { semanticEmbedder, supabaseVector } from '../vectors';
import {
  conversationOutcomeSchema,
  recencyClassificationSchema,
  researchOutputSchema,
  scriptOutputSchema,
  summarizeEpisode,
  summarizeUserProfile,
  topicSuggestionTraceSchema,
  truncate,
  userProfileSchema,
} from './workflowSchemas';

const persistSemanticSnapshots = async ({
  resourceId,
  threadId,
  userProfile,
  outcome,
  script,
  runtimeContext,
  mastra,
}: {
  resourceId?: string;
  threadId?: string;
  userProfile?: z.infer<typeof userProfileSchema>;
  outcome: z.infer<typeof conversationOutcomeSchema>;
  script: z.infer<typeof scriptOutputSchema>;
  runtimeContext?: any;
  mastra?: any;
}) => {
  if (!resourceId) return;
  if (outcome.status !== 'READY') return;
  if (runtimeContext?.get?.('episodeSemanticsSaved')) return;
  const storage = mastra?.getStorage?.();
  if (!storage) {
    throw new Error('Semantic snapshot persist requires storage; none was provided.');
  }

  const messages: MastraMessageV1[] = [];
  if (userProfile) {
    const profileDoc = summarizeUserProfile(userProfile);
    if (profileDoc) {
      messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: truncate(profileDoc),
        createdAt: new Date(),
        resourceId,
        threadId,
        type: 'text',
      });
    }
  }

  if (script && outcome?.episodeSpec) {
    const episodeDoc = summarizeEpisode(outcome, script);
    messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: truncate(episodeDoc),
      createdAt: new Date(),
      resourceId: `${resourceId}-episodes`,
      threadId: 'episodes',
      type: 'text',
    });
  }

  if (messages.length === 0) return;

  const memory = new Memory({
    storage,
    vector: supabaseVector,
    embedder: semanticEmbedder,
  });

  await memory.saveMessages({ messages });
  runtimeContext?.set?.('episodeSemanticsSaved', true);
};

const planBootstrapStep = createStep({
  id: 'plan-bootstrap',
  inputSchema: z.object({
    episodeSpec: episodeSpecSchema,
    assistantMessage: z.string().optional(),
    confidence: z.number().optional(),
    userProfile: userProfileSchema.optional(),
    resourceId: z.string().optional(),
    threadId: z.string().optional(),
  }),
  outputSchema: z.object({
    messages: z.array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    ),
    outcome: conversationOutcomeSchema,
    topicSuggestions: z.array(topicSuggestionTraceSchema).optional(),
    userProfile: userProfileSchema.optional(),
  }),
  execute: async ({ inputData }) => {
    const outcome: z.infer<typeof conversationOutcomeSchema> = {
      status: 'READY',
      assistantMessage: inputData.assistantMessage ?? 'Episode plan ready.',
      nextQuestion: null,
      episodeSpec: inputData.episodeSpec,
      signals: {
        feedback: null,
        settingsChange: null,
      },
      confidence: inputData.confidence ?? 0.8,
    };

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'assistant', content: outcome.assistantMessage },
    ];

    const topicSuggestions: Array<z.infer<typeof topicSuggestionTraceSchema>> = [];
    const userProfile = inputData.userProfile;

    return {
      messages,
      outcome,
      topicSuggestions,
      userProfile,
    };
  },
});

const recencyStep = createStep({
  id: 'recency-classifier',
  inputSchema: z.object({
    messages: z.array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    ),
    outcome: conversationOutcomeSchema,
    topicSuggestions: z.array(topicSuggestionTraceSchema).optional(),
    userProfile: userProfileSchema.optional(),
  }),
  outputSchema: z.object({
    messages: z.array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    ),
    outcome: conversationOutcomeSchema,
    topicSuggestions: z.array(topicSuggestionTraceSchema).optional(),
    userProfile: userProfileSchema.optional(),
    recency: recencyClassificationSchema,
  }),
  execute: async ({ inputData, mastra }) => {
    const recencyAgent = mastra.getAgent('recencyClassifierAgent') ?? recencyClassifierAgent;

    const result = await recencyAgent.generate(
      [
        {
          role: 'system',
          content: `Conversation so far:\n${inputData.messages
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n')}`,
        },
        {
          role: 'user',
          content: `Classify recency based on domain cadence and adjust the episode plan if needed.\n\nDraft outcome:\n${JSON.stringify(
            inputData.outcome,
            null,
            2,
          )}`,
        },
      ],
      {
        maxSteps: 8,
        structuredOutput: { schema: recencyClassificationSchema },
      },
    );

    const recency = result.object ?? recencyClassificationSchema.parse(JSON.parse(result.text || '{}'));

    return {
      messages: inputData.messages,
      outcome: recency.adjustedOutcome,
      topicSuggestions: inputData.topicSuggestions,
      userProfile: inputData.userProfile,
      recency,
    };
  },
});

const researchStep = createStep({
  id: 'research',
  inputSchema: z.object({
    messages: z.array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    ),
    outcome: conversationOutcomeSchema,
    topicSuggestions: z.array(topicSuggestionTraceSchema).optional(),
    userProfile: userProfileSchema.optional(),
  }),
  outputSchema: z.object({
    outcome: conversationOutcomeSchema,
    topicSuggestions: z.array(topicSuggestionTraceSchema).optional(),
    userProfile: userProfileSchema.optional(),
    researchAgentId: z.string(),
    research: researchOutputSchema,
    summary: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { outcome } = inputData;
    const classification = outcome.episodeSpec.style;
    const agent = mastra.getAgent('researchAgent') ?? researchAgent;

    const segmentsSummary = outcome.episodeSpec.segments
      .map((segment) => `- ${segment.id}: ${segment.goal} (${segment.minutes} min)`)
      .join('\n');
    const researchPrompt = `Research for this episode plan.

Episode title: ${outcome.episodeSpec.episodeTitle}
Listener intent: ${outcome.episodeSpec.listenerIntent}
Timeframe: ${outcome.episodeSpec.timeframe}
Duration: ${outcome.episodeSpec.durationMinutes} minutes
Style: ${classification}
Segments:
${segmentsSummary || 'n/a'}
Research needed: ${outcome.episodeSpec.research.needed ? 'yes' : 'no'}
Provided queries: ${
      outcome.episodeSpec.research.queries.length > 0
        ? outcome.episodeSpec.research.queries.join('; ')
        : 'n/a'
    }
Personalization:
- callbacksToLastEpisode: ${outcome.episodeSpec.personalization.callbacksToLastEpisode.join(', ') || 'n/a'}
- moreOf: ${outcome.episodeSpec.personalization.moreOf.join(', ') || 'n/a'}
- lessOf: ${outcome.episodeSpec.personalization.lessOf.join(', ') || 'n/a'}

Instructions:
- If the style is single-story/evergreen narrative, favor 1–3 highly focused queries, wait for search results before deciding on the next query allowing the results to guide the next query. 
- If multi-topic/breaking/digest, run 5–10 targeted queries. These queries can be independent of each other and do not require you to learn from the previous results.
- You may refine, add, or drop provided queries to better fit the goal. Keep them concise and search-ready.
- Stop early if the story is sufficiently covered.
- Stitch findings into a concise brief that maps to the segment goals.
- Include detailed, fact-rich summaries for sources and a factBank of concrete facts.
- Avoid duplication across queries; keep only novel facts and omit repeats.
- Return only JSON in the requested research output shape.
`;

    const result = await agent.generate(
      [
        {
          role: 'user',
          content: researchPrompt,
        },
      ],
      {
        maxSteps: 15,
        structuredOutput: { schema: researchOutputSchema },
      },
    );

    const research =
      result.object ?? researchOutputSchema.parse(JSON.parse(result.text || '{}'));
    const stitchedSummary =
      research.stitchedSummary || result.text || 'Research completed with no summary returned.';
    const summary = `Research completed on "${outcome.episodeSpec.episodeTitle}":\n\n${stitchedSummary}`;

    return {
      outcome,
      topicSuggestions: inputData.topicSuggestions,
      userProfile: inputData.userProfile,
      researchAgentId: 'researchAgent',
      research,
      summary,
    };
  },
});

const scriptWriterStep = createStep({
  id: 'script-writer',
  inputSchema: z.object({
    outcome: conversationOutcomeSchema,
    topicSuggestions: z.array(topicSuggestionTraceSchema).optional(),
    userProfile: userProfileSchema.optional(),
    researchAgentId: z.string(),
    research: researchOutputSchema,
    summary: z.string(),
  }),
  outputSchema: z.object({
    outcome: conversationOutcomeSchema,
    topicSuggestions: z.array(topicSuggestionTraceSchema).optional(),
    userProfile: userProfileSchema.optional(),
    researchAgentId: z.string(),
    research: researchOutputSchema,
    summary: z.string(),
    script: scriptOutputSchema,
  }),
  execute: async ({ inputData, mastra }) => {
    const scriptWriter = mastra.getAgent('scriptWriterAgent') ?? scriptWriterAgent;
    const { outcome, research, summary, userProfile } = inputData;

    const segmentNotes = research.segmentNotes
      .map((segment) => `- ${segment.segmentId} (${segment.goal}): ${segment.notes}`)
      .join('\n');

    const sourcesByQuery = research.sourcesByQuery
      .map((entry) => {
        const sourcesSummary = entry.sources
          .map(
            (source) =>
              `* ${source.title} (${source.url})`,
          )
          .join('\n');
        return `Query: ${entry.query}\n${sourcesSummary}`;
      })
      .join('\n\n');

    const promptMessages = [
      {
        role: 'system' as const,
        content: `Final episode spec:\n${JSON.stringify(outcome.episodeSpec, null, 2)}`,
      },
      {
        role: 'system' as const,
        content:
          'Segments in episodeSpec are placeholders; you own final segmentation based on research and style. Design the segment list yourself.',
      },
      ...(userProfile
        ? ([
            {
              role: 'system' as const,
              content: `User profile (preferences and history):\n${JSON.stringify(userProfile, null, 2)}`,
            },
          ] as const)
        : []),
      {
        role: 'system' as const,
        content: `Research summary:\n${summary}`,
      },
      {
        role: 'system' as const,
        content: `Segment notes:\n${segmentNotes || 'n/a'}`,
      },
      {
        role: 'system' as const,
        content: `Fact bank:\n${research.factBank.join('\n') || 'n/a'}`,
      },
      {
        role: 'system' as const,
        content: `Open questions:\n${research.openQuestions.join('\n') || 'n/a'}`,
      },
      {
        role: 'system' as const,
        content: `Sources by query (titles/urls only):\n${sourcesByQuery || 'n/a'}`,
      },
      {
        role: 'system' as const,
        content:
          'Title rules: make the episodeTitle distinctive with a concrete detail; do not start it with words like "Exploring" or "Unveiling". Each segment must have a specific content-rich title (not a broad domain label) so repeat coverage stays differentiated.',
      },
      {
        role: 'system' as const,
        content:
          'Show notes: provide 1-2 concise items in episode order that capture specific takeaways and reflect the episode style.',
      },
      {
        role: 'system' as const,
        content:
          'For show notes, follow SEO-friendly podcast best practices: catchy keyword-rich phrasing, brief value-driven hooks, timestamps with key takeaways, and note any guests/resources/CTA succinctly while staying within 1-2 items.',
      },
      {
        role: 'user' as const,
        content:
          'Write the full episode script using the episodeSpec and research. Return only the JSON described in your instructions.',
      },
    ];

    const result = await scriptWriter.generate(promptMessages as any, {
      maxSteps: 18,
      structuredOutput: { schema: scriptOutputSchema },
    });

    const script =
      result.object || scriptOutputSchema.parse(JSON.parse(result.text || '{}'));

    return {
      ...inputData,
      topicSuggestions: inputData.topicSuggestions,
      script,
    };
  },
});

const audioRewriteStep = createStep({
  id: 'audio-rewrite',
  inputSchema: z.object({
    outcome: conversationOutcomeSchema,
    topicSuggestions: z.array(topicSuggestionTraceSchema).optional(),
    userProfile: userProfileSchema.optional(),
    researchAgentId: z.string(),
    research: researchOutputSchema,
    summary: z.string(),
    script: scriptOutputSchema,
  }),
  outputSchema: z.object({
    outcome: conversationOutcomeSchema,
    topicSuggestions: z.array(topicSuggestionTraceSchema).optional(),
    userProfile: userProfileSchema.optional(),
    researchAgentId: z.string(),
    research: researchOutputSchema,
    summary: z.string(),
    script: scriptOutputSchema,
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const audioRewriter = mastra.getAgent('audioRewriterAgent') ?? audioRewriterAgent;
    const { script } = inputData;

    const prompt = `Rewrite this script for audio delivery. Return the same JSON structure; only adjust the script text fields for audio clarity. Keep titles, durations, segment order, and showNotes exactly the same.\n\n${JSON.stringify(
      script,
      null,
      2,
    )}`;

    const result = await audioRewriter.generate(
      [
        {
          role: 'user',
          content: prompt,
        },
      ],
      {
        maxSteps: 12,
        structuredOutput: { schema: scriptOutputSchema },
      },
    );

    const rewrittenScript =
      result.object || scriptOutputSchema.parse(JSON.parse(result.text || '{}'));

    const getRuntimeId = (key: string) => {
      const value = runtimeContext?.get?.(key);
      return typeof value === 'string' && value.length > 0 ? value : undefined;
    };
    const resourceId = getRuntimeId('resourceId') ?? getRuntimeId('resource');
    const threadId = getRuntimeId('threadId') ?? getRuntimeId('thread');

    await persistSemanticSnapshots({
      resourceId,
      threadId,
      userProfile: inputData.userProfile,
      outcome: inputData.outcome,
      script: rewrittenScript,
      runtimeContext,
      mastra,
    });

    return {
      ...inputData,
      topicSuggestions: inputData.topicSuggestions,
      script: rewrittenScript,
    };
  },
});

export const researchAndScriptWorkflow = createWorkflow({
  id: 'research-and-script-workflow',
  inputSchema: planBootstrapStep.inputSchema,
  outputSchema: z.object({
    outcome: conversationOutcomeSchema,
    topicSuggestions: z.array(topicSuggestionTraceSchema).optional(),
    userProfile: userProfileSchema.optional(),
    researchAgentId: z.string(),
    research: researchOutputSchema,
    summary: z.string(),
    script: scriptOutputSchema,
  }),
  steps: [planBootstrapStep, recencyStep, researchStep, scriptWriterStep, audioRewriteStep],
});

researchAndScriptWorkflow
  .then(planBootstrapStep)
  .then(recencyStep)
  .then(researchStep)
  .then(scriptWriterStep)
  .then(audioRewriteStep)
  .commit();
