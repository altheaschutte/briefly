import { EpisodeSchedule, ScheduleRun } from '../domain/types';

export const SCHEDULES_REPOSITORY = 'SCHEDULES_REPOSITORY';

export interface CreateScheduleInput {
  frequency: EpisodeSchedule['frequency'];
  localTimeMinutes: number;
  timezone: string;
  targetDurationMinutes?: number | null;
}

export interface UpdateScheduleInput {
  frequency?: EpisodeSchedule['frequency'];
  localTimeMinutes?: number;
  timezone?: string;
  isActive?: boolean;
  targetDurationMinutes?: number | null;
  nextRunAt?: Date | null;
  lastRunAt?: Date | null;
  lastStatus?: EpisodeSchedule['lastStatus'];
  lastError?: string | null;
}

export interface ScheduleRunInput {
  scheduleId: string;
  userId: string;
  status: ScheduleRun['status'];
  message?: string | null;
  episodeId?: string | null;
  durationSeconds?: number | null;
}

export interface SchedulesRepository {
  listByUser(userId: string): Promise<EpisodeSchedule[]>;
  listDue(now: Date, limit?: number): Promise<EpisodeSchedule[]>;
  getById(userId: string, id: string): Promise<EpisodeSchedule | undefined>;
  create(userId: string, input: CreateScheduleInput, nextRunAt: Date): Promise<EpisodeSchedule>;
  update(userId: string, id: string, updates: UpdateScheduleInput): Promise<EpisodeSchedule | undefined>;
  delete(userId: string, id: string): Promise<void>;
  insertRun(run: ScheduleRunInput): Promise<ScheduleRun>;
  listRuns(userId: string, scheduleId: string, limit?: number): Promise<ScheduleRun[]>;
}
