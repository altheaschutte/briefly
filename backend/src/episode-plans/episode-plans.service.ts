import { Inject, Injectable } from '@nestjs/common';
import { EpisodePlan } from './episode-plans.types';
import { EPISODE_PLANS_REPOSITORY, EpisodePlansRepository } from './episode-plans.repository';

@Injectable()
export class EpisodePlansService {
  constructor(
    @Inject(EPISODE_PLANS_REPOSITORY)
    private readonly plansRepository: EpisodePlansRepository,
  ) {}

  async createPlan(input: {
    userId: string;
    resourceId: string;
    threadId?: string;
    assistantMessage?: string;
    confidence?: number;
    episodeSpec: unknown;
    userProfile?: unknown;
  }): Promise<EpisodePlan> {
    return this.plansRepository.create(input);
  }

  async getPlan(userId: string, planId: string): Promise<EpisodePlan | undefined> {
    return this.plansRepository.getById(userId, planId);
  }
}
