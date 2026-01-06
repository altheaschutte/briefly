import { Inject, Injectable, Logger } from '@nestjs/common';
import { EpisodeSchedule } from '../domain/types';
import { SchedulesService } from './schedules.service';

@Injectable()
export class SchedulesRunnerService {
  private readonly logger = new Logger(SchedulesRunnerService.name);
  private processing = false;

  constructor(
    private readonly schedulesService: SchedulesService,
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
      { skipCurrentWindow: true },
    );

    // Automatic scheduled runs are disabled in the new plan-based workflow (requires a planId).
    await this.schedulesService.recordRun({
      scheduleId: schedule.id,
      userId: schedule.userId,
      status: 'skipped',
      message: 'Skipped: plan-based workflow requires manual plan creation',
    });
    await this.schedulesService.updateAfterRun(schedule, {
      status: 'skipped',
      error: 'Plan-based workflow requires manual plan creation',
      nextRunAt,
    });
  }
}
