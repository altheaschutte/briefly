export type TopicRow = {
  id: string;
  user_id: string;
  original_text: string;
  rewritten_query?: string | null;
  is_active: boolean;
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
