import { EpisodePlan } from './episode-plans.types';

export const EPISODE_PLANS_REPOSITORY = 'EPISODE_PLANS_REPOSITORY';

export interface EpisodePlansRepository {
  create(input: {
    userId: string;
    resourceId: string;
    threadId?: string;
    assistantMessage?: string;
    confidence?: number;
    episodeSpec: unknown;
    userProfile?: unknown;
  }): Promise<EpisodePlan>;

  getById(userId: string, planId: string): Promise<EpisodePlan | undefined>;
}
