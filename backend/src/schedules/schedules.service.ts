import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { EpisodeSchedule, ScheduleRun } from '../domain/types';
import {
  CreateScheduleInput,
  ScheduleRunInput,
  SCHEDULES_REPOSITORY,
  SchedulesRepository,
  UpdateScheduleInput,
} from './schedules.repository';

export type CreateScheduleDto = CreateScheduleInput;
export type UpdateScheduleDto = Omit<UpdateScheduleInput, 'nextRunAt' | 'lastRunAt' | 'lastStatus' | 'lastError'>;

@Injectable()
export class SchedulesService {
  private readonly maxSchedulesPerUser = 2;

  constructor(@Inject(SCHEDULES_REPOSITORY) private readonly repository: SchedulesRepository) {}

  listSchedules(userId: string): Promise<EpisodeSchedule[]> {
    return this.repository.listByUser(userId);
  }

  listDueSchedules(now: Date): Promise<EpisodeSchedule[]> {
    return this.repository.listDue(now);
  }

  listRuns(userId: string, scheduleId: string, limit?: number): Promise<ScheduleRun[]> {
    return this.repository.listRuns(userId, scheduleId, limit);
  }

  async createSchedule(userId: string, dto: CreateScheduleDto): Promise<EpisodeSchedule> {
    await this.assertScheduleLimit(userId);
    const nextRunAt = this.computeNextRunAt(dto.frequency, dto.localTimeMinutes, dto.timezone, new Date());
    return this.repository.create(userId, dto, nextRunAt);
  }

  async updateSchedule(userId: string, scheduleId: string, dto: UpdateScheduleDto): Promise<EpisodeSchedule> {
    const existing = await this.repository.getById(userId, scheduleId);
    if (!existing) {
      throw new NotFoundException('Schedule not found');
    }
    const nextRunAt =
      dto.isActive === false
        ? null
        : this.computeNextRunAt(
            dto.frequency ?? existing.frequency,
            dto.localTimeMinutes ?? existing.localTimeMinutes,
            dto.timezone ?? existing.timezone,
            new Date(),
          );

    const updated = await this.repository.update(userId, scheduleId, {
      frequency: dto.frequency ?? existing.frequency,
      localTimeMinutes: dto.localTimeMinutes ?? existing.localTimeMinutes,
      timezone: dto.timezone ?? existing.timezone,
      isActive: dto.isActive ?? existing.isActive,
      targetDurationMinutes: dto.targetDurationMinutes ?? existing.targetDurationMinutes,
      nextRunAt,
    });
    if (!updated) {
      throw new NotFoundException('Schedule not found');
    }
    return updated;
  }

  async deleteSchedule(userId: string, scheduleId: string): Promise<void> {
    await this.repository.delete(userId, scheduleId);
  }

  async recordRun(run: ScheduleRunInput): Promise<ScheduleRun> {
    return this.repository.insertRun(run);
  }

  async recomputeForTimezone(userId: string, timezone: string): Promise<void> {
    const schedules = await this.repository.listByUser(userId);
    for (const schedule of schedules) {
      if (!schedule.isActive) {
        await this.repository.update(userId, schedule.id, { timezone });
        continue;
      }
      const nextRunAt = this.computeNextRunAt(schedule.frequency, schedule.localTimeMinutes, timezone, new Date());
      await this.repository.update(userId, schedule.id, { timezone, nextRunAt });
    }
  }

  async updateAfterRun(
    schedule: EpisodeSchedule,
    updates: { status: ScheduleRun['status']; error?: string | null; nextRunAt: Date },
  ): Promise<void> {
    await this.repository.update(schedule.userId, schedule.id, {
      lastRunAt: new Date(),
      lastStatus: updates.status,
      lastError: updates.error ?? null,
      nextRunAt: updates.nextRunAt,
    });
  }

  computeNextRunAt(
    frequency: EpisodeSchedule['frequency'],
    localTimeMinutes: number,
    timezone: string,
    now: Date,
  ): Date {
    const intervalDays = this.frequencyToDays(frequency);
    if (intervalDays <= 0) {
      throw new BadRequestException('Invalid frequency');
    }
    const hours = Math.floor(localTimeMinutes / 60);
    const minutes = localTimeMinutes % 60;
    const nowZoned = DateTime.fromJSDate(now, { zone: timezone });
    let target = nowZoned.set({
      hour: hours,
      minute: minutes,
      second: 0,
      millisecond: 0,
    });

    const windowStartOffsetMinutes = 15;
    const windowStart = target.minus({ minutes: windowStartOffsetMinutes });

    if (nowZoned < windowStart) {
      return windowStart.toUTC().toJSDate();
    }

    if (nowZoned < target) {
      return nowZoned.toUTC().toJSDate();
    }

    target = target.plus({ days: intervalDays });
    return target.minus({ minutes: windowStartOffsetMinutes }).toUTC().toJSDate();
  }

  private async assertScheduleLimit(userId: string) {
    const schedules = await this.repository.listByUser(userId);
    const activeCount = schedules.filter((s) => s.isActive).length;
    if (activeCount >= this.maxSchedulesPerUser) {
      throw new BadRequestException(`You can have up to ${this.maxSchedulesPerUser} schedules.`);
    }
  }

  private frequencyToDays(frequency: EpisodeSchedule['frequency']): number {
    switch (frequency) {
      case 'daily':
        return 1;
      case 'every_2_days':
        return 2;
      case 'every_3_days':
        return 3;
      case 'every_4_days':
        return 4;
      case 'every_5_days':
        return 5;
      case 'every_6_days':
        return 6;
      case 'weekly':
        return 7;
      default:
        return 1;
    }
  }
}
