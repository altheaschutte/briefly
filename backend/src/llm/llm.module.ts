import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LLM_PROVIDER_TOKEN } from './llm.constants';
import { LlmProvider } from './llm.provider';
import { LlmService } from './llm.service';
import { OpenAiLlmProvider } from './openai-llm.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: LLM_PROVIDER_TOKEN,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): LlmProvider => {
        const provider = configService.get<string>('LLM_PROVIDER') ?? 'openai';
        if (provider === 'openai') {
          return new OpenAiLlmProvider(configService);
        }
        throw new Error(`Unsupported LLM provider: ${provider}`);
      },
    },
    LlmService,
  ],
  exports: [LlmService, LLM_PROVIDER_TOKEN],
})
export class LlmModule {}
