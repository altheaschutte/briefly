export interface EpisodePlan {
  id: string;
  userId: string;
  resourceId: string;
  threadId?: string;
  assistantMessage?: string;
  confidence?: number;
  episodeSpec: any;
  userProfile?: any;
  createdAt: Date;
  updatedAt: Date;
}
