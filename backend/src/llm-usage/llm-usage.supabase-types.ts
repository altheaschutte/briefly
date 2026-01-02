export type LlmUsageEventRow = {
  id: string;
  user_id: string;
  episode_id?: string | null;
  topic_id?: string | null;
  segment_id?: string | null;
  flow?: string | null;
  operation: string;
  provider?: string | null;
  model?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  cost_usd?: number | null;
  usage?: any | null;
  created_at: string;
};

type LlmUsageEventsTable = {
  Row: LlmUsageEventRow;
  Insert: Omit<LlmUsageEventRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
  Update: Partial<LlmUsageEventRow>;
  Relationships: [];
};

export type SupabaseDatabase = {
  public: {
    Tables: {
      llm_usage_events: LlmUsageEventsTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

