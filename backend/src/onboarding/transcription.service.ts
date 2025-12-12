import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly model: string;
  private client: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {
    this.model = this.configService.get<string>('ONBOARDING_TRANSCRIPTION_MODEL') ?? 'gpt-4o-transcribe';
  }

  async transcribe(buffer: Buffer): Promise<string> {
    if (!buffer || !buffer.length) {
      return '';
    }

    try {
      const client = this.getClient();
      const file = await toFile(buffer, 'speech.webm');
      const response = await client.audio.transcriptions.create({
        model: this.model,
        file,
        response_format: 'text',
        temperature: 0,
      });
      const text = typeof response === 'string' ? response : (response as any)?.text;
      return (text || '').trim();
    } catch (error) {
      this.logger.error(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private getClient(): OpenAI {
    if (this.client) {
      return this.client;
    }
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY must be set for onboarding transcription');
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: this.configService.get<string>('OPENAI_BASE_URL') || undefined,
    });
    return this.client;
  }
}
