export type ProfileRow = {
  id: string;
  first_name: string;
  intention: string;
  user_about_context: string;
  timezone: string;
  created_at: string;
  updated_at: string;
};

type ProfilesTable = {
  Row: ProfileRow;
  Insert: ProfileRow;
  Update: Partial<ProfileRow>;
  Relationships: [];
};

export type ProfilesDatabase = {
  public: {
    Tables: {
      profiles: ProfilesTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
