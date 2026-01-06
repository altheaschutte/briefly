import { mastra } from '../../../mastra';

/**
 * Streaming producer chat endpoint (AI SDK v5 compatible).
 * POST http://localhost:4112/api/producer/chat/stream
 *
 * Body:
 * {
 *   "userMessage": "string",                // required
 *   "resourceId": "user-or-account-id",     // required, scopes memory
 *   "threadId": "optional-existing-thread", // optional, to continue a convo
 *   "messages": [                           // optional, prior turns
 *     { "role": "user"|"assistant", "content": "..." }
 *   ]
 * }
 */
export async function POST(request: Request) {
  const { userMessage, resourceId, threadId, messages } = await request.json();

  if (!userMessage || !resourceId) {
    return new Response('userMessage and resourceId are required', { status: 400 });
  }

  const workflow = mastra.getWorkflow('producer-conversation-workflow');
  if (!workflow) {
    return new Response('Producer conversation workflow not found', { status: 500 });
  }

  const run = await workflow.createRunAsync();
  const stream = await run.streamVNext({
    inputData: {
      userMessage,
      resourceId,
      threadId,
      messages,
    },
  });

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

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'x-run-id': run.runId ?? run.id ?? '',
    },
  });
}
