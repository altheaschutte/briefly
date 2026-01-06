import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LLM_PROVIDER_TOKEN } from './llm.constants';
import { LlmProvider } from './llm.provider';
import { LlmService } from './llm.service';
import { OpenAiLlmProvider } from './openai-llm.provider';
import { LlmUsageModule } from '../llm-usage/llm-usage.module';
import { LlmUsageService } from '../llm-usage/llm-usage.service';
import { LLM_CONFIG } from './llm.config';

@Module({
  imports: [ConfigModule, LlmUsageModule],
  providers: [
    {
      provide: LLM_PROVIDER_TOKEN,
      inject: [ConfigService, LlmUsageService],
      useFactory: (configService: ConfigService, llmUsageService: LlmUsageService): LlmProvider => {
        const logger = new Logger('LlmProvider');
        if (LLM_CONFIG.provider !== 'openai') {
          throw new Error(`Unsupported LLM provider (hard-coded): ${LLM_CONFIG.provider}`);
        }

        const provider = new OpenAiLlmProvider(configService, {
          apiKeyConfigKeys: ['OPENAI_API_KEY'],
          baseUrlConfigKeys: ['OPENAI_BASE_URL'],
          rewriteModelConfigKeys: [],
          scriptModelConfigKeys: [],
          extractionModelConfigKeys: [],
          defaultQueryModel: LLM_CONFIG.models.rewrite,
          defaultScriptModel: LLM_CONFIG.models.script,
          defaultExtractionModel: LLM_CONFIG.models.extraction,
          providerLabel: 'OpenAI',
          usageReporter: llmUsageService,
        });

        logger.log(`LLM provider configured: openai (models rewrite/script/extraction = ${LLM_CONFIG.models.rewrite}/${LLM_CONFIG.models.script}/${LLM_CONFIG.models.extraction})`);
        return provider;
      },
    },
    LlmService,
  ],
  exports: [LlmService, LLM_PROVIDER_TOKEN],
})
export class LlmModule {}
