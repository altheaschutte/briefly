import { OnboardingTranscript, OnboardingTranscriptStatus } from '../domain/types';

export const ONBOARDING_REPOSITORY = 'ONBOARDING_REPOSITORY';

export interface OnboardingTranscriptUpdateInput {
  transcript?: string;
  status?: OnboardingTranscriptStatus;
  extractedTopics?: string[];
  errorMessage?: string;
}

export interface OnboardingTranscriptsRepository {
  create(userId: string, transcript?: string): Promise<OnboardingTranscript>;
  update(
    userId: string,
    recordId: string,
    updates: OnboardingTranscriptUpdateInput,
  ): Promise<OnboardingTranscript | undefined>;
  getById(userId: string, recordId: string): Promise<OnboardingTranscript | undefined>;
  delete(userId: string, recordId: string): Promise<void>;
}
