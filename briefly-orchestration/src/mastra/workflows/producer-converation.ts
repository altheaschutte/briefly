import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { producerAgent } from '../agents/producerAgent';
import {
  conversationOutcomeSchema,
  emptyUserProfile,
  entitlementsSchema,
  mergeList,
  mergeSuggestions,
  topicSuggestionTraceSchema,
  userProfileSchema,
} from './workflowSchemas';

const producerConversationStep = createStep({
  id: 'producer-conversation',
  inputSchema: z.object({
    userMessage: z.string(),
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        }),
      )
      .optional(),
    resourceId: z.string().optional(),
    threadId: z.string().optional(),
    entitlements: entitlementsSchema.optional(),
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
  resumeSchema: z.object({
    userMessage: z.string().optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        }),
      )
      .optional(),
    resourceId: z.string().optional(),
    threadId: z.string().optional(),
    confirmed: z.boolean().optional(),
    entitlements: entitlementsSchema.optional(),
  }),
  suspendSchema: z.object({
    message: z.string(),
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        }),
      )
      .optional(),
    resourceId: z.string(),
    threadId: z.string(),
    outcome: conversationOutcomeSchema.optional(),
    topicSuggestions: z.array(topicSuggestionTraceSchema).optional(),
    userProfile: userProfileSchema.optional(),
  }),
  execute: async ({ inputData, resumeData, mastra, suspend, runtimeContext }) => {
    const producer = mastra.getAgent('producerAgent') ?? producerAgent;
    const resumeConfirmed = resumeData?.confirmed === true;
    const resumeDeclined = resumeData?.confirmed === false;

    if (resumeConfirmed) {
      const pendingOutcome = runtimeContext?.get?.('pendingPlanOutcome');
      const pendingMessages = runtimeContext?.get?.('pendingPlanMessages');
      const pendingTopicSuggestions = runtimeContext?.get?.('pendingPlanTopicSuggestions');
      const pendingUserProfile = runtimeContext?.get?.('pendingPlanUserProfile');
      if (pendingOutcome && Array.isArray(pendingMessages)) {
        const parsedOutcome = conversationOutcomeSchema.safeParse(pendingOutcome);
        if (parsedOutcome.success) {
          return {
            messages: pendingMessages as Array<{ role: 'user' | 'assistant'; content: string }>,
            outcome: parsedOutcome.data,
            topicSuggestions: pendingTopicSuggestions as
              | Array<z.infer<typeof topicSuggestionTraceSchema>>
              | undefined,
            userProfile: pendingUserProfile as z.infer<typeof userProfileSchema> | undefined,
          };
        }
      }
    }
    const resumeMessages = resumeData?.messages;
    const baseMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...(resumeMessages ?? inputData.messages ?? []),
    ];
    const incomingUserMessage = resumeData?.userMessage ?? inputData.userMessage;

    const getRuntimeId = (key: string) => {
      const value = runtimeContext?.get?.(key);
      return typeof value === 'string' && value.length > 0 ? value : undefined;
    };
    const runtimeResourceId = getRuntimeId('resourceId');
    const runtimeResource = getRuntimeId('resource');
    if (runtimeResourceId && runtimeResource && runtimeResourceId !== runtimeResource) {
      throw new Error('runtimeContext resourceId and resource do not match.');
    }
    const inputResourceId = resumeData?.resourceId ?? inputData.resourceId;
    const resourceId = runtimeResourceId ?? runtimeResource ?? inputResourceId;
    if (!resourceId) {
      throw new Error('Missing resourceId in runtimeContext or input.');
    }
    if (!runtimeResourceId) {
      runtimeContext?.set?.('resourceId', resourceId);
    }
    if (!runtimeResource) {
      runtimeContext?.set?.('resource', resourceId);
    }
    const inputThreadId = resumeData?.threadId ?? inputData.threadId;
    const runtimeThreadId = getRuntimeId('threadId');
    const runtimeThread = getRuntimeId('thread');
    if (runtimeThreadId && runtimeThread && runtimeThreadId !== runtimeThread) {
      throw new Error('runtimeContext threadId and thread do not match.');
    }

    const memory = await producer.getMemory({ runtimeContext });
    if (!memory) {
      throw new Error('Unable to access memory for producer agent.');
    }
    const threadId = runtimeThreadId ?? runtimeThread ?? inputThreadId ?? randomUUID();
    if (!runtimeThreadId) {
      runtimeContext?.set?.('threadId', threadId);
    }
    if (!runtimeThread) {
      runtimeContext?.set?.('thread', threadId);
    }
    const existingThread = await memory.getThreadById({ threadId });
    if (existingThread?.resourceId && existingThread.resourceId !== resourceId) {
      throw new Error('threadId does not belong to the provided resourceId.');
    }
    const thread =
      existingThread ??
      (await memory.createThread({
        resourceId,
        threadId,
        title: 'Producer workflow',
      }));
    if (!thread?.id) {
      throw new Error('Unable to create or resolve thread for producer conversation.');
    }
    const resolvedResourceId = thread.resourceId ?? resourceId;
    const resolvedThreadId = thread.id ?? threadId;

    const inputEntitlements = resumeData?.entitlements ?? inputData.entitlements;
    const runtimeEntitlements = runtimeContext?.get?.('entitlements');
    const resolvedEntitlements = inputEntitlements ?? runtimeEntitlements;
    if (inputEntitlements) {
      runtimeContext?.set?.('entitlements', inputEntitlements);
    }

    if (incomingUserMessage) {
      const lastMessage = baseMessages[baseMessages.length - 1];
      if (!lastMessage || lastMessage.role !== 'user' || lastMessage.content !== incomingUserMessage) {
        baseMessages.push({
          role: 'user' as const,
          content: incomingUserMessage,
        });
      }
    }

    const messages =
      baseMessages.length > 0
        ? baseMessages
        : [
            {
              role: 'user' as const,
              content: inputData.userMessage,
            },
          ];

    const latestUserMessage =
      incomingUserMessage ??
      [...baseMessages].reverse().find((message) => message.role === 'user')?.content ??
      inputData.userMessage;

    const dateStamp = new Date().toISOString().slice(0, 10);
    const systemMessages: Array<{ role: 'system'; content: string }> = [
      {
        role: 'system' as const,
        content: `Today is ${dateStamp}. Use this for recency framing and queries.`,
      },
    ];
    const durationCap =
      resolvedEntitlements?.maxDurationMinutes &&
      Number.isFinite(resolvedEntitlements.maxDurationMinutes) &&
      resolvedEntitlements.maxDurationMinutes > 0
        ? resolvedEntitlements.maxDurationMinutes
        : undefined;
    if (durationCap) {
      systemMessages.push({
        role: 'system' as const,
        content: `User entitlement cap: maximum duration ${durationCap} minutes (buffer included). Do not exceed this when setting episodeSpec.durationMinutes.`,
      });
    }
    const promptMessages = [
      ...systemMessages,
      {
        role: 'user' as const,
        content: latestUserMessage,
      },
    ];

    const result = await producer.generate(promptMessages as any, {
      maxSteps: 10,
      structuredOutput: { schema: conversationOutcomeSchema },
      memory: { resource: resolvedResourceId, thread: resolvedThreadId },
      ...(runtimeContext ? { runtimeContext } : {}),
    });

    const outcome = result.object || conversationOutcomeSchema.parse(JSON.parse(result.text || '{}'));
    if (resumeDeclined && outcome.status === 'READY') {
      outcome.status = 'NEEDS_USER_REPLY';
      outcome.nextQuestion =
        outcome.nextQuestion || 'Want to adjust anything, or confirm this plan?';
    }
    if (durationCap && outcome.episodeSpec?.durationMinutes > durationCap) {
      outcome.episodeSpec.durationMinutes = durationCap;
      if (Array.isArray(outcome.episodeSpec.segments) && outcome.episodeSpec.segments.length > 0) {
        outcome.episodeSpec.segments = outcome.episodeSpec.segments.map((segment, index) =>
          index === 0 ? { ...segment, minutes: durationCap } : segment,
        );
      }
      if (typeof outcome.assistantMessage === 'string' && outcome.assistantMessage.trim().length > 0) {
        outcome.assistantMessage = `${outcome.assistantMessage}\n\nNote: I capped the duration at ${durationCap} minutes based on your plan.`;
      }
    }

    const updatedMessages = [
      ...messages,
      {
        role: 'assistant' as const,
        content: outcome.assistantMessage || (result.text ?? ''),
      },
    ];

    const topicSuggestions =
      (runtimeContext?.get?.('topicSuggestionsTrace') as
        | Array<z.infer<typeof topicSuggestionTraceSchema>>
        | undefined) ?? [];

    const existingProfileRaw = runtimeContext?.get?.('userProfile');
    const parsedProfile = userProfileSchema.safeParse(existingProfileRaw);
    const existingProfile = parsedProfile.success ? parsedProfile.data : emptyUserProfile;
    const entitlementProfile = resolvedEntitlements
      ? {
          maxDurationMinutes: durationCap,
          bufferMinutes: resolvedEntitlements?.bufferMinutes,
          maxEpisodeMinutes: resolvedEntitlements?.maxEpisodeMinutes,
          remainingMinutes: resolvedEntitlements?.remainingMinutes,
        }
      : existingProfile.entitlements;
    const updatedProfile: z.infer<typeof userProfileSchema> = {
      ...existingProfile,
      interests: mergeList(existingProfile.interests, [outcome.episodeSpec.listenerIntent]),
      likes: mergeList(existingProfile.likes, outcome.episodeSpec.personalization.moreOf),
      dislikes: mergeList(existingProfile.dislikes, outcome.episodeSpec.personalization.lessOf),
      callbacksToLastEpisode: mergeList(
        existingProfile.callbacksToLastEpisode,
        outcome.episodeSpec.personalization.callbacksToLastEpisode,
      ),
      moreOf: mergeList(existingProfile.moreOf, outcome.episodeSpec.personalization.moreOf),
      lessOf: mergeList(existingProfile.lessOf, outcome.episodeSpec.personalization.lessOf),
      recentSuggestions: mergeSuggestions(existingProfile.recentSuggestions ?? [], topicSuggestions),
      lastEpisodeTitle: outcome.episodeSpec.episodeTitle || existingProfile.lastEpisodeTitle,
      entitlements: entitlementProfile,
    };

    runtimeContext?.set?.('userProfile', updatedProfile);

    if (outcome.status === 'READY') {
      runtimeContext?.set?.('pendingPlanOutcome', outcome);
      runtimeContext?.set?.('pendingPlanMessages', updatedMessages);
      runtimeContext?.set?.('pendingPlanTopicSuggestions', topicSuggestions);
      runtimeContext?.set?.('pendingPlanUserProfile', updatedProfile);
    }

    if (outcome.status === 'READY' && !resumeConfirmed) {
      await suspend({
        message: 'Episode plan ready. Confirm to save and generate?',
        messages: updatedMessages,
        resourceId: resolvedResourceId,
        threadId: resolvedThreadId,
        outcome,
        topicSuggestions,
        userProfile: updatedProfile,
      });
      return {
        messages: updatedMessages,
        outcome,
        topicSuggestions,
        userProfile: updatedProfile,
      };
    }

    return {
      messages: updatedMessages,
      outcome,
      topicSuggestions,
      userProfile: updatedProfile,
    };
  },
});

export const producerConversationWorkflow = createWorkflow({
  id: 'producer-conversation-workflow',
  inputSchema: producerConversationStep.inputSchema,
  outputSchema: producerConversationStep.outputSchema,
  steps: [producerConversationStep],
});

producerConversationWorkflow.then(producerConversationStep).commit();

/**
 * Lightweight streaming entry point for WebSocket/SSE bridges.
 * The backend can call this to kick off a producer conversation stream and relay chunks to clients.
 */
export async function streamProducerConversation({
  userMessage,
  resourceId,
  threadId,
  messages,
  runtimeContext,
}: {
  userMessage: string;
  resourceId: string;
  threadId?: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  runtimeContext?: any;
}) {
  if (!resourceId) {
    throw new Error('resourceId is required to stream a producer conversation.');
  }

  const thread = threadId ?? randomUUID();
  const payload =
    messages && messages.length > 0
      ? messages
      : [
          {
            role: 'user' as const,
            content: userMessage,
          },
        ];

  const stream = await producerAgent.stream(payload as any, {
    format: 'aisdk', // exposes toUIMessageStreamResponse for HTTP/WebSocket bridges
    structuredOutput: { schema: conversationOutcomeSchema },
    memory: {
      resource: resourceId,
      thread,
      options: {
        lastMessages: 12,
        semanticRecall: {
          topK: 2,
          messageRange: 1,
          scope: 'resource',
        },
      },
    },
    runtimeContext,
  });

  return { stream, resourceId, threadId: thread };
}
