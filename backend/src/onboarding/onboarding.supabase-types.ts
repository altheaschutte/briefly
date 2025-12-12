export type OnboardingTranscriptRow = {
  id: string;
  user_id: string;
  transcript: string;
  status: 'in_progress' | 'completed' | 'failed';
  extracted_topics?: string[] | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
};

type OnboardingTranscriptsTable = {
  Row: OnboardingTranscriptRow;
  Insert: OnboardingTranscriptRow;
  Update: Partial<OnboardingTranscriptRow>;
  Relationships: [];
};

export type SupabaseDatabase = {
  public: {
    Tables: {
      onboarding_transcripts: OnboardingTranscriptsTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
