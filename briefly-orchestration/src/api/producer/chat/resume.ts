import { mastra } from '../../../mastra';

/**
 * Resume producer conversation workflow stream.
 * POST http://localhost:4112/api/producer/chat/resume
 *
 * Body:
 * {
 *   "runId": "string",                 // required
 *   "confirmed": true|false,           // required
 *   "userMessage"?: "string",          // optional (when revising)
 *   "messages"?: [{ role, content }],  // optional
 *   "resourceId"?: "string",
 *   "threadId"?: "string"
 * }
 */
export async function POST(request: Request) {
  const { runId, confirmed, userMessage, messages, resourceId, threadId } = await request.json();

  if (!runId || typeof confirmed !== 'boolean') {
    return new Response('runId and confirmed are required', { status: 400 });
  }

  const workflow = mastra.getWorkflow('producer-conversation-workflow');
  if (!workflow) {
    return new Response('Producer conversation workflow not found', { status: 500 });
  }

  const run = await workflow.createRunAsync({ runId });
  const stream = await run.resumeStreamVNext({
    resumeData: {
      confirmed,
      userMessage,
      messages,
      resourceId,
      threadId,
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
      'x-run-id': run.runId ?? run.id ?? runId,
    },
  });
}
