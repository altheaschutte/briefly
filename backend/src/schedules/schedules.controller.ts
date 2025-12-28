import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { EpisodeSchedule, ScheduleRun } from '../domain/types';
import { SchedulesService } from './schedules.service';

type Frequency = EpisodeSchedule['frequency'];

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  async list(@Req() req: Request) {
    const userId = (req as any).user?.id as string;
    const schedules = await this.schedulesService.listSchedules(userId);
    return schedules.map((s) => this.formatScheduleResponse(s));
  }

  @Post()
  async create(
    @Req() req: Request,
    @Body('frequency') frequency: Frequency,
    @Body('local_time_minutes') localTimeMinutes: number,
    @Body('timezone') timezone: string,
    @Body('target_duration_minutes') targetDurationMinutes?: number,
  ) {
    const userId = (req as any).user?.id as string;
    const freq = this.normalizeFrequency(frequency);
    const minutes = Number(localTimeMinutes);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 24 * 60) {
      throw new BadRequestException('local_time_minutes must be between 0 and 1439');
    }
    const tz = (timezone || '').trim();
    if (!tz) {
      throw new BadRequestException('timezone is required');
    }
    const schedule = await this.schedulesService.createSchedule(userId, {
      frequency: freq,
      localTimeMinutes: minutes,
      timezone: tz,
      targetDurationMinutes,
    });
    return this.formatScheduleResponse(schedule);
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('frequency') frequency?: Frequency,
    @Body('local_time_minutes') localTimeMinutes?: number,
    @Body('timezone') timezone?: string,
    @Body('is_active') isActive?: boolean,
    @Body('target_duration_minutes') targetDurationMinutes?: number,
  ) {
    const userId = (req as any).user?.id as string;
    const updates: any = {};
    if (frequency !== undefined) updates.frequency = this.normalizeFrequency(frequency);
    if (localTimeMinutes !== undefined) {
      const minutes = Number(localTimeMinutes);
      if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 24 * 60) {
        throw new BadRequestException('local_time_minutes must be between 0 and 1439');
      }
      updates.localTimeMinutes = minutes;
    }
    if (timezone !== undefined) {
      const tz = (timezone || '').trim();
      if (!tz) throw new BadRequestException('timezone is required');
      updates.timezone = tz;
    }
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (targetDurationMinutes !== undefined) updates.targetDurationMinutes = targetDurationMinutes;

    const updated = await this.schedulesService.updateSchedule(userId, id, updates);
    return this.formatScheduleResponse(updated);
  }

  @Delete(':id')
  async delete(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    await this.schedulesService.deleteSchedule(userId, id);
    return { success: true };
  }

  @Get(':id/runs')
  async listRuns(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    const runs = await this.schedulesService.listRuns(userId, id, 50);
    return runs.map((run) => this.formatRunResponse(run));
  }

  @Post('bootstrap')
  async bootstrap(
    @Req() req: Request,
    @Body('timezone') timezone?: string,
    @Body('local_time_minutes') localTimeMinutes?: number,
  ) {
    const userId = (req as any).user?.id as string;
    const schedules = await this.schedulesService.listSchedules(userId);
    if (schedules.length) {
      return schedules.map((s) => this.formatScheduleResponse(s));
    }
    const tz = (timezone || '').trim() || 'Australia/Brisbane';
    const minutes = localTimeMinutes ?? 7 * 60;
    const created = await this.schedulesService.createSchedule(userId, {
      frequency: 'daily',
      localTimeMinutes: minutes,
      timezone: tz,
    });
    return [this.formatScheduleResponse(created)];
  }

  private normalizeFrequency(freq?: Frequency): Frequency {
    if (!freq) return 'daily';
    const allowed: Frequency[] = [
      'daily',
      'every_2_days',
      'every_3_days',
      'every_4_days',
      'every_5_days',
      'every_6_days',
      'weekly',
    ];
    if (!allowed.includes(freq)) {
      throw new BadRequestException('frequency is invalid');
    }
    return freq;
  }

  private formatScheduleResponse(schedule: EpisodeSchedule) {
    return {
      id: schedule.id,
      user_id: schedule.userId,
      frequency: schedule.frequency,
      local_time_minutes: schedule.localTimeMinutes,
      timezone: schedule.timezone,
      is_active: schedule.isActive,
      next_run_at: schedule.nextRunAt ? schedule.nextRunAt.toISOString() : null,
      last_run_at: schedule.lastRunAt ? schedule.lastRunAt.toISOString() : null,
      last_status: schedule.lastStatus ?? null,
      last_error: schedule.lastError ?? null,
      target_duration_minutes: schedule.targetDurationMinutes ?? null,
      created_at: schedule.createdAt.toISOString(),
      updated_at: schedule.updatedAt.toISOString(),
    };
  }

  private formatRunResponse(run: ScheduleRun) {
    return {
      id: run.id,
      schedule_id: run.scheduleId,
      user_id: run.userId,
      run_at: run.runAt.toISOString(),
      status: run.status,
      message: run.message ?? null,
      episode_id: run.episodeId ?? null,
      duration_seconds: run.durationSeconds ?? null,
      created_at: run.createdAt.toISOString(),
    };
  }
}
