import { registerApiRoute } from '@mastra/core/server';
import { z } from 'zod';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const entitlementsSchema = z.object({
  maxDurationMinutes: z.number().optional(),
  bufferMinutes: z.number().optional(),
  maxEpisodeMinutes: z.number().optional(),
  remainingMinutes: z.number().optional(),
});

const streamBodySchema = z.object({
  userMessage: z.string(),
  resourceId: z.string(),
  threadId: z.string().optional(),
  messages: z.array(messageSchema).optional(),
  entitlements: entitlementsSchema.optional(),
});

const resumeBodySchema = z.object({
  runId: z.string(),
  confirmed: z.boolean(),
  userMessage: z.string().optional(),
  messages: z.array(messageSchema).optional(),
  resourceId: z.string().optional(),
  threadId: z.string().optional(),
  entitlements: entitlementsSchema.optional(),
});

const threadQuerySchema = z.object({
  resourceId: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
      message: 'limit must be a positive number',
    }),
});

const normalizeMessageContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('');
  }
  if (content && typeof content === 'object' && 'text' in content) {
    const text = (content as { text?: unknown }).text;
    return typeof text === 'string' ? text : '';
  }
  return '';
};

const parseOutcomeFromContent = (content: string): any | null => {
  if (!content) return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return null;
    if ('assistantMessage' in parsed || 'episodeSpec' in parsed || 'status' in parsed) {
      return parsed;
    }
    if ('outcome' in parsed && parsed.outcome && typeof parsed.outcome === 'object') {
      return parsed.outcome;
    }
  } catch {
    return null;
  }
  return null;
};

const resolveAssistantContent = (content: string, outcome: any | null): string => {
  if (outcome && typeof outcome.assistantMessage === 'string' && outcome.assistantMessage.trim().length > 0) {
    return outcome.assistantMessage;
  }
  if (
    outcome &&
    outcome.outcome &&
    typeof outcome.outcome.assistantMessage === 'string' &&
    outcome.outcome.assistantMessage.trim().length > 0
  ) {
    return outcome.outcome.assistantMessage;
  }
  return content;
};

const normalizeThreadMessages = (messages: any[]) => {
  let latestOutcome: any | null = null;
  const normalized = (messages ?? [])
    .map((message, index) => {
      const role = message?.role;
      if (role !== 'user' && role !== 'assistant') return null;
      const content = normalizeMessageContent(message?.content ?? message?.text ?? '');
      if (!content.trim()) return null;
      const parsedOutcome = parseOutcomeFromContent(content);
      if (parsedOutcome?.episodeSpec || parsedOutcome?.assistantMessage) {
        latestOutcome = parsedOutcome;
      }
      return {
        id: message?.id ?? `${role}-${index}`,
        role,
        content: role === 'assistant' ? resolveAssistantContent(content, parsedOutcome) : content,
        createdAt: message?.createdAt ?? undefined,
      };
    })
    .filter(Boolean);
  return { normalized, latestOutcome };
};

const toSseStream = (stream: ReadableStream<any>) => {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    try {
      for await (const event of stream as any) {
        const payload = `data: ${JSON.stringify(event)}\n\n`;
        await writer.write(encoder.encode(payload));
      }
    } finally {
      await writer.close();
    }
  })();

  return readable;
};

export const producerChatStreamRoute = registerApiRoute('/producer/chat/stream', {
  method: 'POST',
  handler: async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = streamBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ message: 'userMessage and resourceId are required' }, 400);
    }

    const mastra = c.get('mastra');
    const workflow =
      mastra.getWorkflow('producerConversationWorkflow') ||
      mastra.getWorkflow('producer-conversation-workflow');
    if (!workflow) {
      return c.json({ message: 'Producer conversation workflow not found' }, 500);
    }

    const run = await workflow.createRunAsync();
    const stream = await run.streamVNext({ inputData: parsed.data });

    return c.newResponse(toSseStream(stream as any), 200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'x-run-id': run.runId ?? run.id ?? '',
    });
  },
});

export const producerChatResumeRoute = registerApiRoute('/producer/chat/resume', {
  method: 'POST',
  handler: async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = resumeBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ message: 'runId and confirmed are required' }, 400);
    }

    const mastra = c.get('mastra');
    const workflow =
      mastra.getWorkflow('producerConversationWorkflow') ||
      mastra.getWorkflow('producer-conversation-workflow');
    if (!workflow) {
      return c.json({ message: 'Producer conversation workflow not found' }, 500);
    }

    const run = await workflow.createRunAsync({ runId: parsed.data.runId });
    const stream = await run.resumeStreamVNext({ resumeData: parsed.data });

    return c.newResponse(toSseStream(stream as any), 200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'x-run-id': run.runId ?? run.id ?? parsed.data.runId,
    });
  },
});

export const producerChatThreadRoute = registerApiRoute('/producer/chat/thread/:threadId', {
  method: 'GET',
  handler: async (c) => {
    const threadId = c.req.param('threadId');
    const queryRaw = c.req.query();
    const parsedQuery = threadQuerySchema.safeParse(queryRaw);
    if (!threadId) {
      return c.json({ message: 'threadId is required' }, 400);
    }
    if (!parsedQuery.success) {
      return c.json({ message: 'Invalid query params', errors: parsedQuery.error.flatten() }, 400);
    }

    const mastra = c.get('mastra');
    const agent = mastra.getAgent('producerAgent');
    if (!agent) {
      return c.json({ message: 'Producer agent not found' }, 500);
    }

    const memory = await agent.getMemory();
    if (!memory) {
      return c.json({ message: 'Memory unavailable for producer agent' }, 500);
    }

    const { resourceId, limit } = parsedQuery.data;
    const safeLimit = limit && Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;
    const { uiMessages, messages } = await memory.query({
      threadId,
      resourceId,
      selectBy: { last: safeLimit },
      threadConfig: {
        lastMessages: false,
        semanticRecall: false,
      },
    });

    const { normalized, latestOutcome } = normalizeThreadMessages(uiMessages?.length ? uiMessages : messages ?? []);

    return c.json({
      threadId,
      resourceId,
      messages: normalized,
      latestOutcome: latestOutcome ?? undefined,
    });
  },
});
