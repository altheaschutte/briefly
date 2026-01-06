export type EpisodePlanRow = {
  id: string;
  user_id: string;
  resource_id: string;
  thread_id: string | null;
  assistant_message: string | null;
  confidence: number | null;
  episode_spec: any;
  user_profile: any | null;
  created_at: string;
  updated_at: string;
};
