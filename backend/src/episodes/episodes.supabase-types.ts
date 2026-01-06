export type EpisodeRow = {
  id: string;
  user_id: string;
  title?: string | null;
  episode_number?: number | null;
  status: string;
  archived_at?: string | null;
  target_duration_minutes: number;
  duration_seconds?: number | null;
  audio_url?: string | null;
  cover_image_url?: string | null;
  cover_prompt?: string | null;
  transcript?: string | null;
  show_notes?: string | null;
  description?: string | null;
  error_message?: string | null;
  parent_episode_id?: string | null;
  parent_segment_id?: string | null;
  dive_deeper_seed_id?: string | null;
  plan_id?: string | null;
  workflow_run_id?: string | null;
  created_at: string;
  updated_at: string;
  usage_recorded_at?: string | null;
};

type EpisodesTable = {
  Row: EpisodeRow;
  Insert: EpisodeRow;
  Update: Partial<EpisodeRow>;
  Relationships: [];
};

export type EpisodeSourceRow = {
  id: string;
  episode_id: string;
  segment_id?: string | null;
  title?: string | null;
  source_title: string;
  url: string;
  type?: string | null;
  created_at: string;
};

type EpisodeSourcesTable = {
  Row: EpisodeSourceRow;
  Insert: EpisodeSourceRow;
  Update: Partial<EpisodeSourceRow>;
  Relationships: [];
};

export type EpisodeSegmentRow = {
  id: string;
  episode_id: string;
  order_index: number;
  segment_type?: string | null;
  title?: string | null;
  raw_content: string;
  raw_sources?: any | null;
  script?: string | null;
  audio_url?: string | null;
  start_time_seconds?: number | null;
  duration_seconds?: number | null;
  created_at: string;
};

type EpisodeSegmentsTable = {
  Row: EpisodeSegmentRow;
  Insert: EpisodeSegmentRow;
  Update: Partial<EpisodeSegmentRow>;
  Relationships: [];
};

export type SegmentDiveDeeperSeedRow = {
  id: string;
  episode_id: string;
  segment_id: string;
  position?: number | null;
  title: string;
  angle: string;
  focus_claims?: any | null;
  seed_queries?: any | null;
  context_bundle?: any | null;
  created_at: string;
  updated_at: string;
};

type SegmentDiveDeeperSeedsTable = {
  Row: SegmentDiveDeeperSeedRow;
  Insert: SegmentDiveDeeperSeedRow;
  Update: Partial<SegmentDiveDeeperSeedRow>;
  Relationships: [];
};

export type SupabaseDatabase = {
  public: {
    Tables: {
      episodes: EpisodesTable;
      episode_sources: EpisodeSourcesTable;
      episode_segments: EpisodeSegmentsTable;
      segment_dive_deeper_seeds: SegmentDiveDeeperSeedsTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
