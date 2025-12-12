import { Inject, Injectable } from '@nestjs/common';
import { TTS_PROVIDER_TOKEN } from './tts.constants';
import { TtsProvider, TtsSynthesisResult } from './tts.interfaces';

@Injectable()
export class TtsService {
  constructor(@Inject(TTS_PROVIDER_TOKEN) private readonly provider: TtsProvider) {}

  synthesize(
    script: string,
    options: { voiceA: string; voiceB: string; storageKey?: string },
  ): Promise<TtsSynthesisResult> {
    return this.provider.synthesize(script, options);
  }
}
