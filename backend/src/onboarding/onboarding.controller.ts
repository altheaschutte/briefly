import { Controller, Post, Req, Res, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('stream')
  async streamTranscription(@Req() req: Request, @Res() res: Response) {
    const userId = (req as any).user?.id as string;
    const session = await this.onboardingService.startSession(userId);

    this.setupSse(res);
    this.writeEvent(res, 'session', { session_id: session.id });

    const audioChunks: Buffer[] = [];
    let lastTranscript = '';
    let debounce: NodeJS.Timeout | null = null;
    let processing = false;
    let closed = false;

    const flushPartial = async () => {
      if (closed || processing) {
        return;
      }
      processing = true;
      try {
        const transcript = await this.onboardingService.transcribeAudio(Buffer.concat(audioChunks));
        if (transcript && transcript !== lastTranscript) {
          lastTranscript = transcript;
          await this.onboardingService.recordPartialTranscript(userId, session.id, transcript);
          this.writeEvent(res, 'transcript', { session_id: session.id, transcript });
        }
      } catch (error) {
        this.logger.error(
          `Partial transcription failed for session ${session.id}: ${error instanceof Error ? error.message : error}`,
        );
        await this.onboardingService.markFailure(userId, session.id, error);
        this.writeEvent(res, 'error', { message: 'transcription_failed' });
      } finally {
        processing = false;
      }
    };

    const scheduleFlush = () => {
      if (closed) {
        return;
      }
      if (debounce) {
        clearTimeout(debounce);
      }
      debounce = setTimeout(() => {
        flushPartial().catch((error) =>
          this.logger.error(
            `Scheduled transcription flush failed for session ${session.id}: ${
              error instanceof Error ? error.message : error
            }`,
          ),
        );
      }, 900);
    };

    req.on('data', (chunk: Buffer) => {
      audioChunks.push(Buffer.from(chunk));
      scheduleFlush();
    });

    req.on('end', async () => {
      closed = true;
      if (debounce) {
        clearTimeout(debounce);
      }
      try {
        if (!lastTranscript) {
          lastTranscript = await this.onboardingService.transcribeAudio(Buffer.concat(audioChunks));
          await this.onboardingService.recordPartialTranscript(userId, session.id, lastTranscript);
        }
        const result = await this.onboardingService.finalizeSession(userId, session.id, lastTranscript);
        this.writeEvent(res, 'completed', {
          session_id: session.id,
          transcript: result.record.transcript,
          topics: result.extractedTopics,
          created_topic_ids: result.createdTopicIds,
        });
      } catch (error) {
        this.logger.error(
          `Failed to finalize onboarding session ${session.id}: ${error instanceof Error ? error.message : error}`,
        );
        await this.onboardingService.markFailure(userId, session.id, error);
        this.writeEvent(res, 'error', { message: 'finalization_failed' });
      } finally {
        if (!res.writableEnded) {
          res.end();
        }
      }
    });

    req.on('close', () => {
      closed = true;
      if (debounce) {
        clearTimeout(debounce);
      }
      if (!res.writableEnded) {
        res.end();
      }
    });
  }

  private setupSse(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    (res as any).flushHeaders?.();
  }

  private writeEvent(res: Response, event: string, data: Record<string, any>) {
    if (res.writableEnded) {
      return;
    }
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}
