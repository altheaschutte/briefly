import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { parseBuffer } from 'music-metadata';
import { v4 as uuid } from 'uuid';
import { StorageService } from '../storage/storage.service';
import { SegmentDialogueScript } from '../llm/llm.types';
import { TtsProvider, TtsSynthesisResult } from './tts.interfaces';

@Injectable()
export class OpenAiTtsProvider implements TtsProvider {
  private readonly logger = new Logger(OpenAiTtsProvider.name);
  private readonly model = 'gpt-4o-mini-tts';
  private readonly defaultVoice = 'alloy';
  private client: OpenAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {}

  async synthesize(
    script: SegmentDialogueScript,
    options: { voice: string; storageKey?: string },
  ): Promise<TtsSynthesisResult> {
    const client = this.getClient();
    const voice = (options.voice || this.defaultVoice || '').trim() || this.defaultVoice;

    const input = this.renderDialogueText(script);
    const response = await client.audio.speech.create({
      model: this.model,
      voice,
      input,
      response_format: 'mp3',
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const durationSeconds = await this.measureDurationSeconds(buffer);
    const key = options.storageKey || `audio/${uuid()}.mp3`;
    const upload = await this.storageService.uploadAudio(buffer, key);

    return { audioUrl: upload.url, storageKey: upload.key, durationSeconds };
  }

  private renderDialogueText(script: SegmentDialogueScript): string {
    const rendered = (script.turns || [])
      .map((turn) => turn.text)
      .filter((line) => line?.trim().length > 0)
      .join('\n\n')
      .trim();
    return rendered || script.title || 'Podcast segment';
  }

  private getClient(): OpenAI {
    if (this.client) return this.client;
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY must be set for OpenAI TTS');
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: this.configService.get<string>('OPENAI_BASE_URL') || undefined,
    });
    return this.client;
  }

  private async measureDurationSeconds(buffer: Buffer): Promise<number | undefined> {
    try {
      const metadata = await parseBuffer(buffer, 'audio/mpeg');
      const seconds = metadata?.format?.duration;
      if (!seconds || !isFinite(seconds) || seconds <= 0) return undefined;
      return Math.round(seconds);
    } catch (error) {
      this.logger.warn(
        `Failed to read audio duration from OpenAI response: ${error instanceof Error ? error.message : error}`,
      );
      return undefined;
    }
  }
}
