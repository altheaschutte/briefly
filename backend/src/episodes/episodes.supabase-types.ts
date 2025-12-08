export type EpisodeRow = {
  id: string;
  user_id: string;
  status: string;
  target_duration_minutes: number;
  audio_url?: string | null;
  transcript?: string | null;
  script_prompt?: string | null;
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

export type SupabaseDatabase = {
  public: {
    Tables: {
      episodes: EpisodesTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
