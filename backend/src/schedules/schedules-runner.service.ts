import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EpisodesService } from '../episodes/episodes.service';
import { TopicsService } from '../topics/topics.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { EPISODES_QUEUE_TOKEN } from '../queue/queue.constants';
import { EpisodeSchedule } from '../domain/types';
import { SchedulesService } from './schedules.service';

@Injectable()
export class SchedulesRunnerService {
  private readonly logger = new Logger(SchedulesRunnerService.name);
  private processing = false;

  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly topicsService: TopicsService,
    private readonly episodesService: EpisodesService,
    private readonly entitlementsService: EntitlementsService,
    @Inject(EPISODES_QUEUE_TOKEN) private readonly episodesQueue: Queue,
  ) {}

  async processDueSchedules(now = new Date()): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const due = await this.schedulesService.listDueSchedules(now);
      for (const schedule of due) {
        await this.processSchedule(schedule, now);
      }
    } finally {
      this.processing = false;
    }
  }

  private async processSchedule(schedule: EpisodeSchedule, now: Date): Promise<void> {
    const nextRunAt = this.schedulesService.computeNextRunAt(
      schedule.frequency,
      schedule.localTimeMinutes,
      schedule.timezone,
      now,
    );

    try {
      const topics = await this.topicsService.listTopics(schedule.userId, { isActive: true });
      if (!topics.length) {
        await this.schedulesService.recordRun({
          scheduleId: schedule.id,
          userId: schedule.userId,
          status: 'skipped',
          message: 'No active topics',
        });
        await this.schedulesService.updateAfterRun(schedule, {
          status: 'skipped',
          error: 'No active topics',
          nextRunAt,
        });
        return;
      }

      const duration =
        schedule.targetDurationMinutes ?? this.entitlementsService.getDefaultDurationMinutes();
      await this.entitlementsService.ensureCanCreateEpisode(schedule.userId, duration);
      const episode = await this.episodesService.createEpisode(schedule.userId, duration);
      await this.episodesQueue.add('generate', {
        episodeId: episode.id,
        userId: schedule.userId,
        duration: episode.targetDurationMinutes,
        scheduleId: schedule.id,
      });

      await this.schedulesService.recordRun({
        scheduleId: schedule.id,
        userId: schedule.userId,
        status: 'success',
        message: 'Episode queued',
        episodeId: episode.id,
      });
      await this.schedulesService.updateAfterRun(schedule, {
        status: 'success',
        error: null,
        nextRunAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Schedule ${schedule.id} failed: ${message}`);
      await this.schedulesService.recordRun({
        scheduleId: schedule.id,
        userId: schedule.userId,
        status: 'failed',
        message,
      });
      await this.schedulesService.updateAfterRun(schedule, {
        status: 'failed',
        error: message,
        nextRunAt,
      });
    }
  }
}
