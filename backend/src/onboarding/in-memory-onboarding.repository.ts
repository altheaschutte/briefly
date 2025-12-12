import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { OnboardingTranscript } from '../domain/types';
import {
  OnboardingTranscriptUpdateInput,
  OnboardingTranscriptsRepository,
} from './onboarding.repository';

@Injectable()
export class InMemoryOnboardingRepository implements OnboardingTranscriptsRepository {
  constructor(private readonly store: InMemoryStoreService) {}

  async create(userId: string, transcript = ''): Promise<OnboardingTranscript> {
    const now = new Date();
    const record: OnboardingTranscript = {
      id: uuid(),
      userId,
      transcript,
      status: 'in_progress',
      extractedTopics: [],
      createdAt: now,
      updatedAt: now,
    };
    return this.store.saveOnboardingTranscript(record);
  }

  async update(
    userId: string,
    recordId: string,
    updates: OnboardingTranscriptUpdateInput,
  ): Promise<OnboardingTranscript | undefined> {
    return this.store.updateOnboardingTranscript(userId, recordId, updates);
  }

  async getById(userId: string, recordId: string): Promise<OnboardingTranscript | undefined> {
    return this.store.getOnboardingTranscript(userId, recordId);
  }
}
