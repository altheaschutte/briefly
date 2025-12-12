import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuid } from 'uuid';
import { parseBuffer } from 'music-metadata';
import { StorageService } from '../storage/storage.service';
import { TtsProvider, TtsSynthesisResult } from './tts.interfaces';

@Injectable()
export class ElevenLabsProvider implements TtsProvider {
  private readonly baseUrl: string;
  private readonly hostVoiceId: string;
  private readonly guestVoiceId: string;
  private readonly modelId: string;
  private readonly logger = new Logger(ElevenLabsProvider.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {
    this.baseUrl = this.configService.get<string>('ELEVENLABS_BASE_URL') ?? 'https://api.elevenlabs.io';
    this.hostVoiceId = this.configService.get<string>('ELEVENLABS_HOST_VOICE_ID') ?? 'abRFZIdN4pvo8ZPmGxHP';
    this.guestVoiceId = this.configService.get<string>('ELEVENLABS_GUEST_VOICE_ID') ?? '5GZaeOOG7yqLdoTRsaa6';
    // Default to Eleven Multilingual v2 per requested tuning
    this.modelId = this.configService.get<string>('ELEVENLABS_MODEL_ID') ?? 'eleven_multilingual_v2';
  }

  async synthesize(
    script: string,
    options: { voiceA: string; voiceB: string; storageKey?: string },
  ): Promise<TtsSynthesisResult> {
    const apiKey = this.getApiKey();
    const voiceId = options.voiceA || this.hostVoiceId;

    const response = await axios.post<ArrayBuffer>(
      `${this.baseUrl}/v1/text-to-speech/${voiceId}/stream`,
      {
        model_id: this.modelId,
        text: script,
        voice_settings: {
          stability: 0.53,
          similarity_boost: 0.54,
          style: 0.22,
          use_speaker_boost: true,
          speed: 0.99,
        },
      },
      {
        headers: {
          'xi-api-key': apiKey,
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      },
    );

    const buffer = Buffer.from(response.data);
    const durationSeconds = await this.measureDurationSeconds(buffer);
    const key = options.storageKey || `audio/${uuid()}.mp3`;
    const upload = await this.storageService.uploadAudio(buffer, key);
    return { audioUrl: upload.url, storageKey: upload.key, durationSeconds };
  }

  private getApiKey(): string {
    const apiKey = this.configService.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY must be set for ElevenLabs TTS');
    }
    return apiKey;
  }

  private async measureDurationSeconds(buffer: Buffer): Promise<number | undefined> {
    try {
      const metadata = await parseBuffer(buffer, 'audio/mpeg');
      const seconds = metadata?.format?.duration;
      if (!seconds || !isFinite(seconds) || seconds <= 0) {
        return undefined;
      }
      return Math.round(seconds);
    } catch (error) {
      this.logger.warn(
        `Failed to read audio duration from ElevenLabs response: ${error instanceof Error ? error.message : error}`,
      );
      return undefined;
    }
  }
}
