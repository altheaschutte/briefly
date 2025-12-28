import { Controller, Post, Req, Res, Logger, Body, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { OnboardingService } from './onboarding.service';
import { ProfilesService } from '../profiles/profiles.service';
import { SchedulesService } from '../schedules/schedules.service';
import { EpisodeSchedule } from '../domain/types';

@Controller('onboarding')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly profilesService: ProfilesService,
    private readonly schedulesService: SchedulesService,
  ) {}

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
    let finished = false;

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
        finished = true;
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
      if (!finished) {
        this.onboardingService
          .cancelSession(userId, session.id)
          .catch((error) =>
            this.logger.error(
              `Failed to cancel onboarding session ${session.id}: ${error instanceof Error ? error.message : error}`,
            ),
          );
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

  @Post('complete')
  async complete(
    @Req() req: Request,
    @Body('timezone') timezone?: string,
    @Body('local_time_minutes') localTimeMinutes?: number,
    @Body('frequency') frequency?: string,
  ) {
    const userId = (req as any).user?.id as string;
    const tz = (timezone || '').trim() || 'Australia/Brisbane';
    const minutes = localTimeMinutes ?? 7 * 60;
    const freq = this.normalizeFrequency((frequency as any) || 'daily');

    if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 24 * 60) {
      throw new BadRequestException('local_time_minutes must be between 0 and 1439');
    }

    const profile = await this.profilesService.upsertTimezone(userId, tz);
    const existing = await this.schedulesService.listSchedules(userId);
    let schedule = existing[0];
    if (!existing.length) {
      schedule = await this.schedulesService.createSchedule(userId, {
        frequency: freq,
        localTimeMinutes: minutes,
        timezone: tz,
      });
    }
    return { profile, schedule };
  }

  private normalizeFrequency(freq: string): EpisodeSchedule['frequency'] {
    const allowed: EpisodeSchedule['frequency'][] = [
      'daily',
      'every_2_days',
      'every_3_days',
      'every_4_days',
      'every_5_days',
      'every_6_days',
      'weekly',
    ];
    return allowed.includes(freq as EpisodeSchedule['frequency']) ? (freq as EpisodeSchedule['frequency']) : 'daily';
  }
}
