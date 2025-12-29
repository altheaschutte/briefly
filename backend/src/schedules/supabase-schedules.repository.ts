import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { EpisodeSchedule, ScheduleRun } from '../domain/types';
import {
  CreateScheduleInput,
  ScheduleRunInput,
  SchedulesRepository,
  UpdateScheduleInput,
} from './schedules.repository';
import { EpisodeScheduleRow, ScheduleRunRow, SchedulesDatabase } from './schedules.supabase-types';
import { handleSupabaseErrors } from '../common/supabase.util';

@Injectable()
export class SupabaseSchedulesRepository implements SchedulesRepository {
  private readonly client: SupabaseClient<SchedulesDatabase>;
  private readonly logger = new Logger(SupabaseSchedulesRepository.name);

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_PROJECT_URL');
    const serviceKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase URL and service role key are required for SupabaseSchedulesRepository');
    }

    this.client = createClient<SchedulesDatabase>(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async listByUser(userId: string): Promise<EpisodeSchedule[]> {
    return handleSupabaseErrors(this.logger, `list schedules for user ${userId}`, async () => {
      const { data, error } = await this.client
        .from('episode_schedules')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) {
        this.logger.error(`Failed to list schedules for user ${userId}: ${error.message}`);
        throw error;
      }
      const rows = (data as EpisodeScheduleRow[] | null) ?? [];
      return rows.map((row) => this.mapSchedule(row));
    });
  }

  async listDue(now: Date, limit = 50): Promise<EpisodeSchedule[]> {
    return handleSupabaseErrors(this.logger, 'list due schedules', async () => {
      const { data, error } = await this.client
        .from('episode_schedules')
        .select('*')
        .eq('is_active', true)
        .lte('next_run_at', now.toISOString())
        .order('next_run_at', { ascending: true })
        .limit(limit);

      if (error) {
        this.logger.error(`Failed to list due schedules: ${error.message}`);
        throw error;
      }
      const rows = (data as EpisodeScheduleRow[] | null) ?? [];
      return rows.map((row) => this.mapSchedule(row));
    });
  }

  async getById(userId: string, id: string): Promise<EpisodeSchedule | undefined> {
    return handleSupabaseErrors(this.logger, `fetch schedule ${id} for user ${userId}`, async () => {
      const { data, error } = await this.client
        .from('episode_schedules')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST116') return undefined;
        this.logger.error(`Failed to fetch schedule ${id} for user ${userId}: ${error.message}`);
        throw error;
      }
      if (!data) return undefined;
      return this.mapSchedule(data as EpisodeScheduleRow);
    });
  }

  async create(userId: string, input: CreateScheduleInput, nextRunAt: Date): Promise<EpisodeSchedule> {
    return handleSupabaseErrors(this.logger, `create schedule for user ${userId}`, async () => {
      const now = new Date().toISOString();
      const payload: EpisodeScheduleRow = {
        id: randomUUID(),
        user_id: userId,
        frequency: input.frequency,
        local_time_minutes: input.localTimeMinutes,
        timezone: input.timezone,
        is_active: true,
        next_run_at: nextRunAt.toISOString(),
        last_run_at: null,
        last_status: null,
        last_error: null,
        target_duration_minutes: input.targetDurationMinutes ?? null,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await this.client.from('episode_schedules').insert(payload).select().maybeSingle();
      if (error) {
        this.logger.error(`Failed to create schedule for user ${userId}: ${error.message}`);
        throw error;
      }
      if (!data) {
        throw new Error('Supabase did not return a schedule row after insert');
      }
      return this.mapSchedule(data as EpisodeScheduleRow);
    });
  }

  async update(
    userId: string,
    id: string,
    updates: UpdateScheduleInput,
  ): Promise<EpisodeSchedule | undefined> {
    return handleSupabaseErrors(this.logger, `update schedule ${id} for user ${userId}`, async () => {
      const now = new Date().toISOString();
      const payload: Partial<EpisodeScheduleRow> = {
        updated_at: now,
      };
      if (updates.frequency !== undefined) payload.frequency = updates.frequency;
      if (updates.localTimeMinutes !== undefined) payload.local_time_minutes = updates.localTimeMinutes;
      if (updates.timezone !== undefined) payload.timezone = updates.timezone;
      if (updates.isActive !== undefined) payload.is_active = updates.isActive;
      if (updates.targetDurationMinutes !== undefined)
        payload.target_duration_minutes = updates.targetDurationMinutes ?? null;
      if (updates.nextRunAt !== undefined) payload.next_run_at = updates.nextRunAt?.toISOString() ?? null;
      if (updates.lastRunAt !== undefined) payload.last_run_at = updates.lastRunAt?.toISOString() ?? null;
      if (updates.lastStatus !== undefined) payload.last_status = updates.lastStatus ?? null;
      if (updates.lastError !== undefined) payload.last_error = updates.lastError ?? null;

      const { data, error } = await this.client
        .from('episode_schedules')
        .update(payload)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST116') return undefined;
        this.logger.error(`Failed to update schedule ${id} for user ${userId}: ${error.message}`);
        throw error;
      }
      if (!data) return undefined;
      return this.mapSchedule(data as EpisodeScheduleRow);
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    return handleSupabaseErrors(this.logger, `delete schedule ${id} for user ${userId}`, async () => {
      const { error } = await this.client
        .from('episode_schedules')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        this.logger.error(`Failed to delete schedule ${id} for user ${userId}: ${error.message}`);
        throw error;
      }
    });
  }

  async insertRun(run: ScheduleRunInput): Promise<ScheduleRun> {
    return handleSupabaseErrors(this.logger, `insert schedule run for schedule ${run.scheduleId}`, async () => {
      const nowIso = new Date().toISOString();
      const payload: ScheduleRunRow = {
        id: randomUUID(),
        schedule_id: run.scheduleId,
        user_id: run.userId,
        run_at: nowIso,
        status: run.status,
        message: run.message ?? null,
        episode_id: run.episodeId ?? null,
        duration_seconds: run.durationSeconds ?? null,
        created_at: nowIso,
      };

      const { data, error } = await this.client.from('schedule_runs').insert(payload).select().maybeSingle();
      if (error) {
        this.logger.error(`Failed to insert schedule run for schedule ${run.scheduleId}: ${error.message}`);
        throw error;
      }
      if (!data) {
        throw new Error('Supabase did not return a schedule_run row after insert');
      }
      return this.mapRun(data as ScheduleRunRow);
    });
  }

  async listRuns(userId: string, scheduleId: string, limit = 20): Promise<ScheduleRun[]> {
    return handleSupabaseErrors(this.logger, `list schedule runs for schedule ${scheduleId} user ${userId}`, async () => {
      const { data, error } = await this.client
        .from('schedule_runs')
        .select('*')
        .eq('user_id', userId)
        .eq('schedule_id', scheduleId)
        .order('run_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.logger.error(
          `Failed to list schedule runs for schedule ${scheduleId} user ${userId}: ${error.message}`,
        );
        throw error;
      }
      const rows = (data as ScheduleRunRow[] | null) ?? [];
      return rows.map((row) => this.mapRun(row));
    });
  }

  private mapSchedule(row: EpisodeScheduleRow): EpisodeSchedule {
    return {
      id: row.id,
      userId: row.user_id,
      frequency: row.frequency,
      localTimeMinutes: row.local_time_minutes,
      timezone: row.timezone,
      isActive: row.is_active,
      nextRunAt: row.next_run_at ? new Date(row.next_run_at) : null,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at) : null,
      lastStatus: row.last_status ?? null,
      lastError: row.last_error ?? null,
      targetDurationMinutes: row.target_duration_minutes ?? null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRun(row: ScheduleRunRow): ScheduleRun {
    return {
      id: row.id,
      scheduleId: row.schedule_id,
      userId: row.user_id,
      runAt: new Date(row.run_at),
      status: row.status,
      message: row.message ?? null,
      episodeId: row.episode_id ?? null,
      durationSeconds: row.duration_seconds ?? null,
      createdAt: new Date(row.created_at),
    };
  }
}
