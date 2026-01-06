import { Body, Controller, ForbiddenException, Get, Inject, Logger, Param, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Queue } from 'bullmq';
import { EpisodePlansService } from '../episode-plans/episode-plans.service';
import { EpisodesService } from '../episodes/episodes.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { EPISODES_QUEUE_TOKEN } from '../queue/queue.constants';

@Controller('producer')
export class ProducerController {
  private readonly logger = new Logger(ProducerController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly episodePlansService: EpisodePlansService,
    private readonly episodesService: EpisodesService,
    private readonly entitlementsService: EntitlementsService,
    @Inject(EPISODES_QUEUE_TOKEN) private readonly episodesQueue: Queue,
  ) {}

  /**
   * Proxy streaming chat to Mastra producer endpoint.
   * POST /producer/chat/stream
   * Body: { userMessage: string; threadId?: string; messages?: [{ role: 'user'|'assistant', content: string }] }
   * Uses the authenticated user id as resourceId.
   */
  @Post('chat/stream')
  async streamChat(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    const userId = (req as any).user?.id as string | undefined;
    const { userMessage, threadId, messages } = body ?? {};

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized: missing user session' });
      return;
    }

    if (!userMessage) {
      res.status(400).json({ message: 'userMessage is required' });
      return;
    }

    let entitlements: Awaited<ReturnType<EntitlementsService['getEntitlements']>> | null = null;
    try {
      entitlements = await this.entitlementsService.getEntitlements(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Insufficient entitlements to start a plan.';
      this.logger.warn(`Producer chat denied: ${message}`);
      res.status(403).json({
        message: 'Insufficient entitlements to start a plan.',
        detail: message,
      });
      return;
    }

    const maxEpisodeMinutes =
      entitlements?.limits?.maxEpisodeMinutes ?? this.entitlementsService.getDefaultDurationMinutes();
    const remainingMinutes =
      entitlements?.secondsRemaining !== undefined && entitlements?.secondsRemaining !== null
        ? Math.floor(entitlements.secondsRemaining / 60)
        : undefined;
    if (remainingMinutes !== undefined && remainingMinutes < 5) {
      res.status(403).json({
        message: 'Not enough remaining minutes to start a plan.',
        detail: 'Upgrade to continue or wait for your minutes to reset.',
      });
      return;
    }
    const allowedMinutes =
      remainingMinutes !== undefined ? Math.min(maxEpisodeMinutes, remainingMinutes) : maxEpisodeMinutes;
    const bufferMinutes = 3;
    const durationCapMinutes = Math.max(1, allowedMinutes - bufferMinutes);
    try {
      await this.entitlementsService.ensureCanCreateEpisode(userId, durationCapMinutes);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Insufficient entitlements to start a plan.';
      this.logger.warn(`Producer chat denied: ${message}`);
      res.status(403).json({
        message: 'Insufficient entitlements to start a plan.',
        detail: message,
      });
      return;
    }

    const baseUrl = this.configService.get<string>('MASTRA_API_URL') || 'http://localhost:4112';
    const normalizedBase = baseUrl.replace(/\/+$/, '').replace(/\/api$/, '');
    const url = `${normalizedBase}/producer/chat/stream`;

    const bodyJson = JSON.stringify({
      userMessage,
      resourceId: userId,
      threadId,
      messages,
      entitlements: {
        maxDurationMinutes: durationCapMinutes,
        bufferMinutes,
        maxEpisodeMinutes,
        remainingMinutes,
      },
    });

    let upstream;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: bodyJson,
      });
    } catch (error) {
      const message = `Failed to reach Mastra at ${url}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message);
      res.status(502).json({ message: 'Producer stream failed', detail: message });
      return;
    }

    if (!upstream.ok || !upstream.body) {
      const text = upstream && (await upstream.text().catch(() => ''));
      const detail = `Mastra stream error ${upstream.status}: ${text?.slice(0, 500)}`;
      this.logger.error(detail);
      res.status(502).json({ message: 'Producer stream failed', detail });
      return;
    }

    // Mirror streaming headers to keep the connection open.
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream');
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('Cache-Control', cacheControl);
    const conn = upstream.headers.get('connection');
    if (conn) res.setHeader('Connection', conn);
    const runIdHeader = upstream.headers.get('x-run-id');
    if (runIdHeader) res.setHeader('x-run-id', runIdHeader);
    (res as any).flushHeaders?.();

    // Pipe streaming body through to the client.
    // upstream.body is a Web-standard ReadableStream; pipe to Express Response
    const reader = upstream.body.getReader();
    const pump = async (): Promise<void> => {
      try {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        if (value) {
          res.write(Buffer.from(value));
        }
        await pump();
      } catch (err: unknown) {
        this.logger.error(`Upstream producer stream error: ${err instanceof Error ? err.message : String(err)}`);
        if (!res.writableEnded) {
          res.end();
        }
      }
    };
    void pump();
  }

  /**
   * Fetch message history for a producer chat thread.
   * GET /producer/chat/thread/:threadId
   */
  @Get('chat/thread/:threadId')
  async getThreadMessages(@Req() req: Request, @Res() res: Response, @Param('threadId') threadId: string) {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized: missing user session' });
      return;
    }
    if (!threadId) {
      res.status(400).json({ message: 'threadId is required' });
      return;
    }

    const baseUrl = this.configService.get<string>('MASTRA_API_URL') || 'http://localhost:4112';
    const normalizedBase = baseUrl.replace(/\/+$/, '').replace(/\/api$/, '');
    const url = `${normalizedBase}/producer/chat/thread/${encodeURIComponent(threadId)}?resourceId=${encodeURIComponent(
      userId,
    )}`;

    let upstream;
    try {
      upstream = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      const message = `Failed to reach Mastra at ${url}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message);
      res.status(502).json({ message: 'Producer thread lookup failed', detail: message });
      return;
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      const detail = `Mastra thread lookup error ${upstream.status}: ${text?.slice(0, 500)}`;
      this.logger.error(detail);
      res.status(502).json({ message: 'Producer thread lookup failed', detail });
      return;
    }

    const data = await upstream.json();
    res.status(200).json(data);
  }

  /**
   * Persist a confirmed plan before resuming the producer workflow.
   * POST /producer/chat/confirm
   * Body: { outcome: { assistantMessage, confidence, episodeSpec }, threadId?, userProfile? }
   */
  @Post('chat/confirm')
  async confirmPlan(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized: missing user session' });
      return;
    }

    const { outcome, threadId, userProfile } = body ?? {};
    const episodeSpec = outcome?.episodeSpec;
    if (!episodeSpec) {
      res.status(400).json({ message: 'episodeSpec is required' });
      return;
    }

    const plan = await this.episodePlansService.createPlan({
      userId,
      resourceId: userId,
      threadId,
      assistantMessage: outcome?.assistantMessage,
      confidence: outcome?.confidence,
      episodeSpec,
      userProfile,
    });

    const durationCandidate = Number(episodeSpec?.durationMinutes);
    const targetDuration = Number.isFinite(durationCandidate) && durationCandidate > 0
      ? durationCandidate
      : this.entitlementsService.getDefaultDurationMinutes();

    try {
      await this.entitlementsService.ensureCanCreateEpisode(userId, targetDuration);
      const episode = await this.episodesService.createEpisode(userId, targetDuration, plan.id);
      await this.episodesQueue.add('generate', { episodeId: episode.id, userId, planId: plan.id });
      res.status(200).json({ planId: plan.id, episodeId: episode.id, status: episode.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create episode';
      this.logger.error(`Confirm plan failed: ${message}`);
      if (error instanceof ForbiddenException) {
        res.status(403).json({ message, planId: plan.id });
        return;
      }
      res.status(500).json({ message, planId: plan.id });
    }
  }

  /**
   * Resume a suspended producer chat run.
   * POST /producer/chat/resume
   * Body: { runId: string; confirmed: boolean; userMessage?: string; messages?: [...] }
   */
  @Post('chat/resume')
  async resumeChat(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    const userId = (req as any).user?.id as string | undefined;
    const { runId, confirmed, userMessage, threadId, messages } = body ?? {};
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized: missing user session' });
      return;
    }
    if (!runId || typeof confirmed !== 'boolean') {
      res.status(400).json({ message: 'runId and confirmed are required' });
      return;
    }

    const baseUrl = this.configService.get<string>('MASTRA_API_URL') || 'http://localhost:4112';
    const normalizedBase = baseUrl.replace(/\/+$/, '').replace(/\/api$/, '');
    const url = `${normalizedBase}/producer/chat/resume`;

    const bodyJson = JSON.stringify({
      runId,
      confirmed,
      userMessage,
      resourceId: userId,
      threadId,
      messages,
    });

    let upstream;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: bodyJson,
      });
    } catch (error) {
      const message = `Failed to reach Mastra at ${url}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message);
      res.status(502).json({ message: 'Producer resume failed', detail: message });
      return;
    }

    if (!upstream.ok || !upstream.body) {
      const text = upstream && (await upstream.text().catch(() => ''));
      const detail = `Mastra resume error ${upstream.status}: ${text?.slice(0, 500)}`;
      this.logger.error(detail);
      res.status(502).json({ message: 'Producer resume failed', detail });
      return;
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream');
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('Cache-Control', cacheControl);
    const conn = upstream.headers.get('connection');
    if (conn) res.setHeader('Connection', conn);
    const runIdHeader = upstream.headers.get('x-run-id');
    if (runIdHeader) res.setHeader('x-run-id', runIdHeader);
    (res as any).flushHeaders?.();

    const reader = upstream.body.getReader();
    const pump = async (): Promise<void> => {
      try {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        if (value) {
          res.write(Buffer.from(value));
        }
        await pump();
      } catch (err: unknown) {
        this.logger.error(`Upstream producer resume error: ${err instanceof Error ? err.message : String(err)}`);
        if (!res.writableEnded) {
          res.end();
        }
      }
    };
    void pump();
  }
}
