import { ConfigService } from '@nestjs/config';

export function getElevenLabsDefaultVoices(configService: ConfigService): { voiceA: string; voiceB: string } {
  const voiceA =
    configService.get<string>('ELEVENLABS_SPEAKER_1') ??
    configService.get<string>('ELEVENLABS_HOST_VOICE_ID') ??
    'abRFZIdN4pvo8ZPmGxHP';
  const voiceB =
    configService.get<string>('ELEVENLABS_SPEAKER_2') ??
    configService.get<string>('ELEVENLABS_GUEST_VOICE_ID') ??
    '5GZaeOOG7yqLdoTRsaa6';
  return { voiceA, voiceB };
}

export function getOpenAiDefaultVoices(configService: ConfigService): { voiceA: string; voiceB: string } {
  const voiceA = configService.get<string>('OPENAI_SPEAKER_1') || 'alloy';
  const voiceB = configService.get<string>('OPENAI_SPEAKER_2') || voiceA;
  return { voiceA, voiceB };
}

export function getDefaultVoices(configService: ConfigService): { voiceA: string; voiceB: string } {
  const provider = (configService.get<string>('TTS_PROVIDER') || 'elevenlabs').toLowerCase();
  if (provider === 'openai') {
    return getOpenAiDefaultVoices(configService);
  }
  return getElevenLabsDefaultVoices(configService);
}
