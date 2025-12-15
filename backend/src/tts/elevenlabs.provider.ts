import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuid } from 'uuid';
import { parseBuffer } from 'music-metadata';
import { StorageService } from '../storage/storage.service';
import { TtsProvider, TtsSynthesisResult } from './tts.interfaces';
import { SegmentDialogueScript, Speaker } from '../llm/llm.types';

@Injectable()
export class ElevenLabsProvider implements TtsProvider {
  private readonly baseUrl: string;
  private readonly hostVoiceId: string;
  private readonly guestVoiceId: string;
  private readonly hostVoiceName?: string;
  private readonly guestVoiceName?: string;
  private readonly voiceNamesById: Record<string, string>;
  private readonly modelId: string;
  private readonly dialogueModelId: string;
  private readonly logger = new Logger(ElevenLabsProvider.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {
    this.baseUrl = this.configService.get<string>('ELEVENLABS_BASE_URL') ?? 'https://api.elevenlabs.io';
    this.hostVoiceId =
      this.configService.get<string>('ELEVENLABS_SPEAKER_1') ??
      this.configService.get<string>('ELEVENLABS_HOST_VOICE_ID') ??
      'abRFZIdN4pvo8ZPmGxHP';
    this.guestVoiceId =
      this.configService.get<string>('ELEVENLABS_SPEAKER_2') ??
      this.configService.get<string>('ELEVENLABS_GUEST_VOICE_ID') ??
      '5GZaeOOG7yqLdoTRsaa6';
    this.hostVoiceName =
      this.configService.get<string>('ELEVENLABS_SPEAKER_1_NAME') ||
      this.configService.get<string>('ELEVENLABS_HOST_VOICE_NAME') ||
      undefined;
    this.guestVoiceName =
      this.configService.get<string>('ELEVENLABS_SPEAKER_2_NAME') ||
      this.configService.get<string>('ELEVENLABS_GUEST_VOICE_NAME') ||
      undefined;
    this.voiceNamesById = {};
    if (this.hostVoiceName) {
      this.voiceNamesById[this.hostVoiceId] = this.hostVoiceName;
    }
    if (this.guestVoiceName) {
      this.voiceNamesById[this.guestVoiceId] = this.guestVoiceName;
    }
    // Default to Eleven Multilingual v2 per requested tuning
    this.modelId = this.configService.get<string>('ELEVENLABS_MODEL_ID') ?? 'eleven_multilingual_v2';
    this.dialogueModelId =
      this.configService.get<string>('ELEVENLABS_DIALOGUE_MODEL_ID') ??
      this.configService.get<string>('ELEVENLABS_MODEL_ID') ??
      'eleven_v3';
  }

  async synthesize(
    script: SegmentDialogueScript,
    options: { voiceA: string; voiceB: string; storageKey?: string },
  ): Promise<TtsSynthesisResult> {
    const apiKey = this.getApiKey();
    const voiceMeta = this.buildVoiceMeta(options);
    const payload = this.buildDialoguePayload(script, voiceMeta);

    try {
      const buffer = await this.streamDialogue(payload, apiKey);
      const durationSeconds = await this.measureDurationSeconds(buffer);
      const key = options.storageKey || `audio/${uuid()}.mp3`;
      const upload = await this.storageService.uploadAudio(buffer, key);
      return { audioUrl: upload.url, storageKey: upload.key, durationSeconds };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Dialogue TTS failed, falling back to single-voice stream: ${message}`);
      const buffer = await this.streamSingleVoice(script, voiceMeta.SPEAKER_1.id, apiKey);
      const durationSeconds = await this.measureDurationSeconds(buffer);
      const key = options.storageKey || `audio/${uuid()}.mp3`;
      const upload = await this.storageService.uploadAudio(buffer, key);
      return { audioUrl: upload.url, storageKey: upload.key, durationSeconds };
    }
  }

  private buildVoiceMeta(
    options: { voiceA: string; voiceB: string },
  ): Record<Speaker, { id: string; name?: string }> {
    const optionVoiceA = options.voiceA || this.hostVoiceId;
    const optionVoiceB = options.voiceB || this.guestVoiceId;
    const meta: Record<Speaker, { id: string; name?: string }> = {
      SPEAKER_1: { id: optionVoiceA, name: this.voiceNamesById[optionVoiceA] },
      SPEAKER_2: { id: optionVoiceB, name: this.voiceNamesById[optionVoiceB] },
    };

    if (optionVoiceA === this.hostVoiceId && this.hostVoiceName) {
      meta.SPEAKER_1.name = this.hostVoiceName;
    }
    if (optionVoiceB === this.guestVoiceId && this.guestVoiceName) {
      meta.SPEAKER_2.name = this.guestVoiceName;
    }

    return meta;
  }

  private buildDialoguePayload(
    script: SegmentDialogueScript,
    voiceMeta: Record<Speaker, { id: string; name?: string }>,
  ) {
    const inputs = (script.turns || [])
      .map((turn) => ({
        text: turn.text?.trim(),
        voice_id: voiceMeta[turn.speaker]?.id,
      }))
      .filter((turn) => Boolean(turn.text && turn.voice_id));

    if (!inputs.length) {
      throw new Error('Dialogue payload missing turns');
    }

    return {
      model_id: this.dialogueModelId,
      inputs,
    };
  }

  private async streamDialogue(payload: any, apiKey: string): Promise<Buffer> {
    const response = await axios.post<ArrayBuffer>(`${this.baseUrl}/v1/text-to-dialogue/stream`, payload, {
      headers: {
        'xi-api-key': apiKey,
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  }

  private renderDialogueText(script: SegmentDialogueScript): string {
    return (script.turns || [])
      .map((turn) => turn.text)
      .filter((line) => line.trim().length > 0)
      .join('\n\n')
      .trim();
  }

  private async streamSingleVoice(script: SegmentDialogueScript, voiceId: string, apiKey: string): Promise<Buffer> {
    const text = this.renderDialogueText(script) || script.title || 'Podcast segment';
    const response = await axios.post<ArrayBuffer>(
      `${this.baseUrl}/v1/text-to-speech/${voiceId}/stream`,
      {
        model_id: this.modelId,
        text,
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
    return Buffer.from(response.data);
  }

  buildPreview(
    script: SegmentDialogueScript,
    options: { voiceA: string; voiceB: string },
  ): {
    primary: { endpoint: string; body: any };
    fallback: { endpoint: string; body: any };
  } {
    const voiceMeta = this.buildVoiceMeta(options);
    const dialogueBody = this.buildDialoguePayload(script, voiceMeta);
    const singleVoiceText = this.renderDialogueText(script) || script.title || 'Podcast segment';

    return {
      primary: {
        endpoint: `${this.baseUrl}/v1/text-to-dialogue/stream`,
        body: dialogueBody,
      },
      fallback: {
        endpoint: `${this.baseUrl}/v1/text-to-speech/${voiceMeta.SPEAKER_1.id}/stream`,
        body: {
          model_id: this.modelId,
          text: singleVoiceText,
          voice_settings: {
            stability: 0.53,
            similarity_boost: 0.54,
            style: 0.22,
            use_speaker_boost: true,
            speed: 0.99,
          },
        },
      },
    };
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
