export type DeviceTokenRow = {
  id: string;
  user_id: string;
  platform: string;
  token: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

type DeviceTokensTable = {
  Row: DeviceTokenRow;
  Insert: DeviceTokenRow;
  Update: Partial<DeviceTokenRow>;
  Relationships: [];
};

export type SupabaseDatabase = {
  public: {
    Tables: {
      device_tokens: DeviceTokensTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
