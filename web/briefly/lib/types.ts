export type AuthToken = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
};

export type Topic = {
  id: string;
  originalText: string;
  orderIndex: number;
  isActive: boolean;
};

export type EpisodeSegment = {
  id: string;
  title?: string;
  order_index?: number;
  script?: string;
  audio_url?: string;
  duration_seconds?: number;
  start_time_seconds?: number;
};

export type EpisodeSource = {
  id: string;
  source_title?: string;
  url?: string;
  type?: string;
};

export type Episode = {
  id: string;
  title: string;
  episodeNumber?: number;
  summary?: string;
  description?: string;
  audioUrl?: string;
  durationSeconds?: number;
  targetDurationMinutes?: number;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  topics?: Topic[];
  segments?: EpisodeSegment[];
  sources?: EpisodeSource[];
  status?: string;
  showNotes?: string;
  transcript?: string;
  coverImageUrl?: string;
  coverPrompt?: string;
  errorMessage?: string;
};

export type Entitlements = {
  limits: {
    maxActiveTopics: number;
  };
  tier: string;
};
