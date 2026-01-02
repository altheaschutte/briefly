export interface Topic {
  id: string;
  userId: string;
  title?: string;
  originalText: string;
  orderIndex: number;
  isActive: boolean;
  isSeed: boolean;
  segmentDiveDeeperSeedId?: string;
  contextBundle?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface TopicQuery {
  id: string;
  userId: string;
  topicId: string;
  episodeId: string;
  query: string;
  answer: string;
  citations: string[];
  orderIndex: number;
  intent?: import('../llm/llm.types').TopicIntent;
  createdAt: Date;
  updatedAt: Date;
}

export type OnboardingTranscriptStatus = 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface OnboardingTranscript {
  id: string;
  userId: string;
  transcript: string;
  status: OnboardingTranscriptStatus;
  extractedTopics?: string[];
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  usageRecordedAt?: Date;
}

export type EpisodeStatus =
  | 'queued'
  | 'rewriting_queries'
  | 'retrieving_content'
  | 'generating_dive_deeper_seeds'
  | 'generating_script'
  | 'generating_audio'
  | 'ready'
  | 'failed';

export interface Episode {
  id: string;
  userId: string;
  episodeNumber?: number;
  title?: string;
  status: EpisodeStatus;
  archivedAt?: Date;
  targetDurationMinutes: number;
  durationSeconds?: number;
  audioUrl?: string;
  coverImageUrl?: string;
  coverPrompt?: string;
  transcript?: string;
  scriptPrompt?: string;
  showNotes?: string;
  description?: string;
  errorMessage?: string;
  parentEpisodeId?: string;
  parentSegmentId?: string;
  diveDeeperSeedId?: string;
  createdAt: Date;
  updatedAt: Date;
  usageRecordedAt?: Date;
}

export interface EpisodeSegment {
  id: string;
  episodeId: string;
  orderIndex: number;
  title?: string;
  intent?: import('../llm/llm.types').TopicIntent;
  rawContent: string;
  rawSources: EpisodeSource[];
  script?: string;
  dialogueScript?: import('../llm/llm.types').SegmentDialogueScript;
  audioUrl?: string;
  startTimeSeconds?: number;
  durationSeconds?: number;
}

export interface EpisodeSource {
  id: string;
  episodeId: string;
  segmentId?: string;
  sourceTitle: string;
  url: string;
  type?: string;
}

export interface SegmentDiveDeeperSeed {
  id: string;
  episodeId: string;
  segmentId: string;
  position?: number;
  title: string;
  angle: string;
  focusClaims: string[];
  seedQueries: string[];
  contextBundle: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  firstName: string;
  intention: string;
  userAboutContext: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ScheduleFrequency =
  | 'daily'
  | 'every_2_days'
  | 'every_3_days'
  | 'every_4_days'
  | 'every_5_days'
  | 'every_6_days'
  | 'weekly';

export type ScheduleRunStatus = 'queued' | 'success' | 'skipped' | 'failed';

export interface EpisodeSchedule {
  id: string;
  userId: string;
  frequency: ScheduleFrequency;
  localTimeMinutes: number;
  timezone: string;
  isActive: boolean;
  nextRunAt?: Date | null;
  lastRunAt?: Date | null;
  lastStatus?: ScheduleRunStatus | null;
  lastError?: string | null;
  targetDurationMinutes?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleRun {
  id: string;
  scheduleId: string;
  userId: string;
  runAt: Date;
  status: ScheduleRunStatus;
  message?: string | null;
  episodeId?: string | null;
  durationSeconds?: number | null;
  createdAt: Date;
}
