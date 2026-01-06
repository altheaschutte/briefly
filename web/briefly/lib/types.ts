export type AuthToken = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
};

export type BillingTier = "free" | "starter" | "pro" | "power";

export type SubscriptionStatus = "none" | "active" | "trialing" | "past_due" | "canceled" | "incomplete";

export type Topic = {
  id: string;
  originalText: string;
  orderIndex: number;
  isActive: boolean;
  isSeed?: boolean;
};

export type EpisodeSegment = {
  id: string;
  title?: string;
  orderIndex?: number;
  order_index?: number;
  script?: string;
  rawContent?: string;
  raw_content?: string;
  audio_url?: string;
  audioUrl?: string;
  durationSeconds?: number;
  duration_seconds?: number;
  startTimeSeconds?: number;
  start_time_seconds?: number;
  sources?: EpisodeSource[];
  rawSources?: EpisodeSource[];
  raw_sources?: EpisodeSource[];
};

export type EpisodeSource = {
  id: string;
  episodeId?: string;
  segmentId?: string;
  source_title?: string;
  url?: string;
  type?: string;
  sourceTitle?: string;
};

export type SegmentDiveDeeperSeed = {
  id: string;
  episodeId?: string;
  segmentId?: string;
  position?: number;
  title: string;
  angle?: string;
  focusClaims?: string[];
  seedQueries?: string[];
  contextBundle?: unknown;
  createdAt?: string;
  updatedAt?: string;
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
  diveDeeperSeeds?: SegmentDiveDeeperSeed[];
};

export type Entitlements = {
  tier: BillingTier;
  status: SubscriptionStatus;
  limits: {
    minutesPerMonth: number | null;
    maxActiveTopics: number;
    maxEpisodeMinutes: number;
    scheduleEnabled: boolean;
  };
  periodStart?: string;
  periodEnd?: string;
  secondsUsed: number;
  secondsLimit?: number;
  secondsRemaining?: number;
  cancelAtPeriodEnd?: boolean;
};

export type BillingTierInfo = {
  tier: BillingTier;
  limits: {
    minutesPerMonth: number | null;
    maxActiveTopics: number;
    maxEpisodeMinutes: number;
    scheduleEnabled: boolean;
  };
  description?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  priceId?: string | null;
};
