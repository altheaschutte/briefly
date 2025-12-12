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
  script_prompt?: string | null;
  show_notes?: string | null;
  description?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
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

export type SupabaseDatabase = {
  public: {
    Tables: {
      episodes: EpisodesTable;
      episode_sources: EpisodeSourcesTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
