import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER_TOKEN } from './llm.constants';
import { LlmProvider } from './llm.provider';

@Injectable()
export class LlmService implements LlmProvider {
  constructor(@Inject(LLM_PROVIDER_TOKEN) private readonly provider: LlmProvider) {}

  rewriteTopic(topic: string): Promise<string> {
    return this.provider.rewriteTopic(topic);
  }

  generateScript(segments: any[], targetDurationMinutes?: number): Promise<string> {
    return this.provider.generateScript(segments, targetDurationMinutes);
  }
}
