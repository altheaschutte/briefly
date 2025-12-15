export interface Topic {
  id: string;
  userId: string;
  originalText: string;
  orderIndex: number;
  isActive: boolean;
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
}

export type EpisodeStatus =
  | 'queued'
  | 'rewriting_queries'
  | 'retrieving_content'
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
  createdAt: Date;
  updatedAt: Date;
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
