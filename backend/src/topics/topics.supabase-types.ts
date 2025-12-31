export type TopicRow = {
  id: string;
  user_id: string;
  original_text: string;
  is_active: boolean;
  is_seed: boolean;
  order_index: number;
  segment_dive_deeper_seed_id?: string | null;
  context_bundle?: any | null;
  created_at: string;
  updated_at: string;
};

type TopicsTable = {
  Row: TopicRow;
  Insert: TopicRow;
  Update: Partial<TopicRow>;
  Relationships: [];
};

export type SupabaseDatabase = {
  public: {
    Tables: {
      topics: TopicsTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
