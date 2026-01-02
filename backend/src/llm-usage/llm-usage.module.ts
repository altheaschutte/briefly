import { Logger, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InMemoryLlmUsageRepository } from './in-memory-llm-usage.repository';
import { LLM_USAGE_REPOSITORY } from './llm-usage.repository';
import { LlmUsageContextService } from './llm-usage.context';
import { LlmUsageService } from './llm-usage.service';
import { SupabaseLlmUsageRepository } from './supabase-llm-usage.repository';

const llmUsageRepositoryProvider: Provider = {
  provide: LLM_USAGE_REPOSITORY,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const logger = new Logger('LlmUsageModule');
    const storagePref = (configService.get<string>('LLM_USAGE_STORAGE') || 'auto').toLowerCase();
    const supabaseUrl = configService.get<string>('SUPABASE_PROJECT_URL');
    const supabaseKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const canUseSupabase = Boolean(supabaseUrl && supabaseKey);

    if (storagePref === 'memory' || (!canUseSupabase && storagePref === 'auto')) {
      if (storagePref !== 'memory' && !canUseSupabase) {
        logger.warn('Supabase env vars missing; falling back to in-memory LLM usage store');
      }
      return new InMemoryLlmUsageRepository();
    }
    if (!canUseSupabase) {
      throw new Error('LLM_USAGE_STORAGE is set to supabase but Supabase env vars are missing');
    }
    return new SupabaseLlmUsageRepository(configService);
  },
};

@Module({
  imports: [ConfigModule],
  providers: [LlmUsageContextService, LlmUsageService, llmUsageRepositoryProvider],
  exports: [LlmUsageContextService, LlmUsageService, llmUsageRepositoryProvider],
})
export class LlmUsageModule {}
