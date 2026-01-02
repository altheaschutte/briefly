import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LLM_PROVIDER_TOKEN } from './llm.constants';
import { LlmProvider } from './llm.provider';
import { LlmService } from './llm.service';
import { OpenAiLlmProvider } from './openai-llm.provider';
import { XaiLlmProvider } from './xai-llm.provider';
import { LlmUsageModule } from '../llm-usage/llm-usage.module';
import { LlmUsageService } from '../llm-usage/llm-usage.service';

type ProviderName = 'openai' | 'xai' | 'grok';

@Module({
  imports: [ConfigModule, LlmUsageModule],
  providers: [
    {
      provide: LLM_PROVIDER_TOKEN,
      inject: [ConfigService, LlmUsageService],
      useFactory: (configService: ConfigService, llmUsageService: LlmUsageService): LlmProvider => {
        const logger = new Logger('LlmProvider');
        const defaultProvider = resolveProviderName(configService.get<string>('LLM_PROVIDER') ?? 'openai');
        const rewriteProviderName = resolveProviderName(
          configService.get<string>('LLM_REWRITE_PROVIDER') ?? defaultProvider,
        );
        const scriptProviderName = resolveProviderName(configService.get<string>('LLM_SCRIPT_PROVIDER') ?? defaultProvider);

        const rewriteProvider = createOpenAiCompatibleProvider(configService, rewriteProviderName as ProviderName, llmUsageService);
        const scriptProvider =
          scriptProviderName === rewriteProviderName
            ? rewriteProvider
            : createOpenAiCompatibleProvider(configService, scriptProviderName as ProviderName, llmUsageService);

        logger.log(
          `LLM providers configured: rewrite=${rewriteProviderName}, script=${scriptProviderName}`,
        );
        const logCall = (label: string, method: string) => {
          logger.log(`[${label}] ${method}`);
        };

        return {
          generateTopicQueries: (...args: Parameters<LlmProvider['generateTopicQueries']>) => {
            logCall(`rewrite:${rewriteProviderName}`, 'generateTopicQueries');
            return rewriteProvider.generateTopicQueries(...args);
          },
          extractTopicBriefs: (...args: Parameters<LlmProvider['extractTopicBriefs']>) => {
            logCall(`rewrite:${rewriteProviderName}`, 'extractTopicBriefs');
            return rewriteProvider.extractTopicBriefs(...args);
          },
          generateSeedTopics: (...args: Parameters<LlmProvider['generateSeedTopics']>) => {
            logCall(`rewrite:${rewriteProviderName}`, 'generateSeedTopics');
            return rewriteProvider.generateSeedTopics(...args);
          },
          generateTopicMeta: (...args: Parameters<LlmProvider['generateTopicMeta']>) => {
            logCall(`rewrite:${rewriteProviderName}`, 'generateTopicMeta');
            return rewriteProvider.generateTopicMeta(...args);
          },
          generateSegmentDiveDeeperSeed: (...args: Parameters<LlmProvider['generateSegmentDiveDeeperSeed']>) => {
            logCall(`rewrite:${rewriteProviderName}`, 'generateSegmentDiveDeeperSeed');
            return rewriteProvider.generateSegmentDiveDeeperSeed(...args);
          },
          generateCoverMotif: (...args: Parameters<LlmProvider['generateCoverMotif']>) => {
            logCall(`rewrite:${rewriteProviderName}`, 'generateCoverMotif');
            return rewriteProvider.generateCoverMotif(...args);
          },
          generateSegmentScript: (...args: Parameters<LlmProvider['generateSegmentScript']>) => {
            logCall(`script:${scriptProviderName}`, 'generateSegmentScript');
            return scriptProvider.generateSegmentScript(...args);
          },
          generateEpisodeMetadata: (...args: Parameters<LlmProvider['generateEpisodeMetadata']>) => {
            logCall(`script:${scriptProviderName}`, 'generateEpisodeMetadata');
            return scriptProvider.generateEpisodeMetadata(...args);
          },
        } satisfies LlmProvider;
      },
    },
    LlmService,
  ],
  exports: [LlmService, LLM_PROVIDER_TOKEN],
})
export class LlmModule {}

function createOpenAiCompatibleProvider(
  configService: ConfigService,
  name: ProviderName,
  usageReporter: LlmUsageService,
): LlmProvider {
  const normalized = name === 'grok' ? 'xai' : name;
  if (normalized === 'openai') {
    return new OpenAiLlmProvider(configService, {
      apiKeyConfigKeys: ['LLM_PROVIDER_OPENAI_API_KEY', 'OPENAI_API_KEY'],
      baseUrlConfigKeys: ['LLM_PROVIDER_OPENAI_BASE_URL', 'OPENAI_BASE_URL'],
      rewriteModelConfigKeys: ['LLM_PROVIDER_OPENAI_REWRITE_MODEL', 'LLM_PROVIDER_REWRITE_MODEL'],
      scriptModelConfigKeys: ['LLM_PROVIDER_OPENAI_SCRIPT_MODEL', 'LLM_PROVIDER_SCRIPT_MODEL'],
      extractionModelConfigKeys: ['LLM_PROVIDER_OPENAI_EXTRACTION_MODEL', 'LLM_PROVIDER_EXTRACTION_MODEL'],
      defaultQueryModel: 'gpt-4.1',
      defaultScriptModel: 'gpt-4.1',
      defaultExtractionModel: 'gpt-4.1',
      usageReporter,
    });
  }

  if (normalized === 'xai') {
    return new XaiLlmProvider(configService, usageReporter);
  }

  throw new Error(`Unsupported LLM provider: ${name}`);
}

function resolveProviderName(raw: string): ProviderName {
  const normalized = (raw || '').toLowerCase();
  if (normalized === 'openai' || normalized === 'xai' || normalized === 'grok') {
    return normalized as ProviderName;
  }
  throw new Error(`Unsupported LLM provider: ${raw}`);
}
