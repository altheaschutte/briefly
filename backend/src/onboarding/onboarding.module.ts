import { Logger, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { LlmModule } from '../llm/llm.module';
import { TopicsModule } from '../topics/topics.module';
import { InMemoryOnboardingRepository } from './in-memory-onboarding.repository';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { ONBOARDING_REPOSITORY } from './onboarding.repository';
import { SupabaseOnboardingRepository } from './supabase-onboarding.repository';
import { TranscriptionService } from './transcription.service';

const repositoryProvider: Provider = {
  provide: ONBOARDING_REPOSITORY,
  inject: [ConfigService, InMemoryStoreService],
  useFactory: (configService: ConfigService, store: InMemoryStoreService) => {
    const logger = new Logger('OnboardingModule');
    const storagePref = (configService.get<string>('ONBOARDING_STORAGE') || 'auto').toLowerCase();
    const supabaseUrl = configService.get<string>('SUPABASE_PROJECT_URL');
    const supabaseKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const canUseSupabase = Boolean(supabaseUrl && supabaseKey);

    if (storagePref === 'memory' || (!canUseSupabase && storagePref === 'auto')) {
      if (storagePref !== 'memory' && !canUseSupabase) {
        logger.warn('Supabase env vars missing; falling back to in-memory onboarding transcript store');
      }
      return new InMemoryOnboardingRepository(store);
    }
    if (!canUseSupabase) {
      throw new Error('ONBOARDING_STORAGE is set to supabase but Supabase env vars are missing');
    }
    return new SupabaseOnboardingRepository(configService);
  },
};

@Module({
  imports: [ConfigModule, TopicsModule, LlmModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, TranscriptionService, repositoryProvider],
  exports: [OnboardingService],
})
export class OnboardingModule {}
