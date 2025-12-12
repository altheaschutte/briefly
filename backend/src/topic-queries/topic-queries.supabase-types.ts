export type TopicQueryRow = {
  id: string;
  user_id: string;
  topic_id: string;
  episode_id: string;
  query: string;
  answer?: string | null;
  citations?: string[] | null;
  order_index: number;
  created_at: string;
  updated_at: string;
};

type TopicQueriesTable = {
  Row: TopicQueryRow;
  Insert: TopicQueryRow;
  Update: Partial<TopicQueryRow>;
  Relationships: [];
};

export type SupabaseDatabase = {
  public: {
    Tables: {
      topic_queries: TopicQueriesTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
