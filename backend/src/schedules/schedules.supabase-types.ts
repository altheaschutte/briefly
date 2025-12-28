export type ScheduleFrequency =
  | 'daily'
  | 'every_2_days'
  | 'every_3_days'
  | 'every_4_days'
  | 'every_5_days'
  | 'every_6_days'
  | 'weekly';

export type ScheduleRunStatus = 'queued' | 'success' | 'skipped' | 'failed';

export type EpisodeScheduleRow = {
  id: string;
  user_id: string;
  frequency: ScheduleFrequency;
  local_time_minutes: number;
  timezone: string;
  is_active: boolean;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status?: ScheduleRunStatus | null;
  last_error?: string | null;
  target_duration_minutes?: number | null;
  created_at: string;
  updated_at: string;
};

type EpisodeSchedulesTable = {
  Row: EpisodeScheduleRow;
  Insert: EpisodeScheduleRow;
  Update: Partial<EpisodeScheduleRow>;
  Relationships: [];
};

export type ScheduleRunRow = {
  id: string;
  schedule_id: string;
  user_id: string;
  run_at: string;
  status: ScheduleRunStatus;
  message?: string | null;
  episode_id?: string | null;
  duration_seconds?: number | null;
  created_at: string;
};

type ScheduleRunsTable = {
  Row: ScheduleRunRow;
  Insert: ScheduleRunRow;
  Update: Partial<ScheduleRunRow>;
  Relationships: [];
};

export type SchedulesDatabase = {
  public: {
    Tables: {
      episode_schedules: EpisodeSchedulesTable;
      schedule_runs: ScheduleRunsTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
