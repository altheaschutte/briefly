import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TopicsService } from '../topics/topics.service';
import { LlmService } from '../llm/llm.service';
import { OnboardingTranscript } from '../domain/types';
import { ONBOARDING_REPOSITORY, OnboardingTranscriptsRepository } from './onboarding.repository';
import { TranscriptionService } from './transcription.service';

export interface OnboardingFinalizationResult {
  record: OnboardingTranscript;
  extractedTopics: string[];
  createdTopicIds: string[];
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @Inject(ONBOARDING_REPOSITORY) private readonly repository: OnboardingTranscriptsRepository,
    private readonly transcriptionService: TranscriptionService,
    private readonly llmService: LlmService,
    private readonly topicsService: TopicsService,
  ) {}

  startSession(userId: string): Promise<OnboardingTranscript> {
    return this.repository.create(userId, '');
  }

  async recordPartialTranscript(
    userId: string,
    sessionId: string,
    transcript: string,
  ): Promise<OnboardingTranscript | undefined> {
    return this.repository.update(userId, sessionId, { transcript, status: 'in_progress' });
  }

  transcribeAudio(buffer: Buffer): Promise<string> {
    return this.transcriptionService.transcribe(buffer);
  }

  async finalizeSession(
    userId: string,
    sessionId: string,
    transcript: string,
  ): Promise<OnboardingFinalizationResult> {
    const updated =
      (await this.repository.update(userId, sessionId, { transcript, status: 'completed' })) ||
      (await this.repository.getById(userId, sessionId));
    if (!updated) {
      throw new NotFoundException('Onboarding transcript not found');
    }

    const trimmedTranscript = (transcript || '').trim();
    let extractedTopics: string[] = [];
    if (trimmedTranscript) {
      try {
        extractedTopics = await this.llmService.extractTopicBriefs(trimmedTranscript);
      } catch (error) {
        this.logger.error(
          `Failed to extract topics for session ${sessionId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    } else {
      this.logger.warn(`Transcript empty for session ${sessionId}; skipping topic extraction`);
    }

    if (extractedTopics.length) {
      await this.repository.update(userId, sessionId, { extractedTopics });
    }

    const createdTopicIds = await this.createTopicsIfNeeded(userId, extractedTopics);

    return {
      record: { ...updated, extractedTopics },
      extractedTopics,
      createdTopicIds,
    };
  }

  async cancelSession(userId: string, sessionId: string): Promise<void> {
    await this.repository.update(userId, sessionId, { status: 'cancelled' });
    await this.repository.delete(userId, sessionId);
  }

  async markFailure(userId: string, sessionId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.repository.update(userId, sessionId, { status: 'failed', errorMessage: message });
  }

  private async createTopicsIfNeeded(userId: string, topics: string[]): Promise<string[]> {
    const created: string[] = [];
    for (const brief of topics) {
      try {
        const topic = await this.topicsService.createTopic(userId, brief);
        created.push(topic.id);
      } catch (error) {
        if (this.isDuplicateTopicError(error)) {
          this.logger.warn(`Topic already exists for user ${userId}: ${brief}`);
          continue;
        }
        this.logger.error(
          `Failed to create topic for user ${userId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    return created;
  }

  private isDuplicateTopicError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    return (
      message.toLowerCase().includes('duplicate key value') ||
      message.toLowerCase().includes('topics_unique_user_text')
    );
  }
}
