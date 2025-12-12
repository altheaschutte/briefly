export interface Topic {
  id: string;
  userId: string;
  originalText: string;
  rewrittenQuery?: string;
  isActive: boolean;
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
  status: EpisodeStatus;
  targetDurationMinutes: number;
  audioUrl?: string;
  transcript?: string;
  scriptPrompt?: string;
  showNotes?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EpisodeSegment {
  id: string;
  episodeId: string;
  orderIndex: number;
  title?: string;
  rawContent: string;
  rawSources: EpisodeSource[];
}

export interface EpisodeSource {
  id: string;
  episodeId: string;
  sourceTitle: string;
  url: string;
  type?: string;
}
