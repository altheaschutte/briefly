import { ConfigService } from '@nestjs/config';

// Single-voice selection (OpenAI only). Only secrets (API keys) stay in env.
export function getDefaultVoice(configService: ConfigService): { voice: string } {
  const voice = configService.get<string>('OPENAI_VOICE') || 'alloy';
  return { voice };
}
