import axios from 'axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuid } from 'uuid';
import { StorageService } from '../storage/storage.service';
import { TtsProvider, TtsSynthesisResult } from './tts.interfaces';

@Injectable()
export class ElevenLabsProvider implements TtsProvider {
  private readonly baseUrl: string;
  private readonly defaultVoice: string;
  private readonly modelId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {
    this.baseUrl = this.configService.get<string>('ELEVENLABS_BASE_URL') ?? 'https://api.elevenlabs.io';
    this.defaultVoice = this.configService.get<string>('ELEVENLABS_DEFAULT_VOICE') ?? 'Rachel';
    this.modelId = this.configService.get<string>('ELEVENLABS_MODEL_ID') ?? 'eleven_multilingual_v2';
  }

  async synthesize(
    script: string,
    options: { voiceA: string; voiceB: string },
  ): Promise<TtsSynthesisResult> {
    const apiKey = this.getApiKey();
    const voiceId = options.voiceA || this.defaultVoice;
    const url = `${this.baseUrl}/v1/text-to-speech/${voiceId}`;

    const response = await axios.post<ArrayBuffer>(
      url,
      {
        text: script,
        model_id: this.modelId,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
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
    const key = `audio/${uuid()}.mp3`;
    const upload = await this.storageService.uploadAudio(buffer, key);
    return { audioUrl: upload.key, storageKey: upload.key };
  }

  private getApiKey(): string {
    const apiKey = this.configService.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY must be set for ElevenLabs TTS');
    }
    return apiKey;
  }
}
