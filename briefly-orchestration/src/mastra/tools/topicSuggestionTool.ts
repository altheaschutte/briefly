import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { topicSuggestionAgent } from '../agents/topicSuggestionAgent';
import { suggestionOutputSchema } from '../schema/topic-suggestion';

export const topicSuggestionTool = createTool({
  id: 'topic-suggestions',
  description: 'Generate and surface fresh episode suggestions when the user asks for ideas.',
  inputSchema: z.object({
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        }),
      )
      .nonempty(),
    resourceId: z.string().optional(),
    threadId: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const runtime = runtimeContext ? { runtimeContext } : {};
    const memoryOptions =
      context.resourceId && context.threadId
        ? { memory: { resource: context.resourceId, thread: context.threadId } }
        : {};
    const suggestionResult = await topicSuggestionAgent.generate(
      [
        {
          role: 'system',
          content: `Conversation so far:\n${context.messages.map((m) => `${m.role}: ${m.content}`).join('\n')}`,
        },
        {
          role: 'user',
          content: 'Provide 2-3 episode ideas based on the user prompt.',
        },
      ],
      {
        maxSteps: 8,
        structuredOutput: { schema: suggestionOutputSchema },
        ...memoryOptions,
        ...runtime,
      },
    );

    let parsed = suggestionResult.object;

    if (!parsed && suggestionResult.text) {
      try {
        parsed = suggestionOutputSchema.parse(JSON.parse(suggestionResult.text));
      } catch (error) {
        parsed = null;
      }
    }

    const traceEntry = {
      calledAt: new Date().toISOString(),
      suggestions: parsed?.suggestions ?? [],
      rationale: parsed?.rationale ?? '',
      messages: context.messages,
    };

    if (runtimeContext?.set) {
      const existing = runtimeContext.get?.('topicSuggestionsTrace');
      const nextTrace = Array.isArray(existing) ? [...existing, traceEntry] : [traceEntry];
      runtimeContext.set('topicSuggestionsTrace', nextTrace);
    }

    return {
      suggestions: traceEntry.suggestions,
      rationale: traceEntry.rationale,
    };
  },
});
