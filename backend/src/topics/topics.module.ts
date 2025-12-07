import { Logger, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { InMemoryTopicsRepository } from './in-memory-topics.repository';
import { SupabaseTopicsRepository } from './supabase-topics.repository';
import { TOPICS_REPOSITORY } from './topics.repository';
import { TopicsService } from './topics.service';
import { TopicsController } from './topics.controller';

const topicsRepositoryProvider: Provider = {
  provide: TOPICS_REPOSITORY,
  inject: [ConfigService, InMemoryStoreService],
  useFactory: (configService: ConfigService, store: InMemoryStoreService) => {
    const logger = new Logger('TopicsModule');
    const storagePref = (configService.get<string>('TOPICS_STORAGE') || 'auto').toLowerCase();
    const supabaseUrl = configService.get<string>('SUPABASE_PROJECT_URL');
    const supabaseKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const canUseSupabase = Boolean(supabaseUrl && supabaseKey);
    if (storagePref === 'memory' || (!canUseSupabase && storagePref === 'auto')) {
      if (storagePref !== 'memory' && !canUseSupabase) {
        logger.warn('Supabase env vars missing; falling back to in-memory topics store');
      }
      return new InMemoryTopicsRepository(store);
    }
    if (!canUseSupabase) {
      throw new Error('TOPICS_STORAGE is set to supabase but Supabase env vars are missing');
    }
    return new SupabaseTopicsRepository(configService);
  },
};

@Module({
  providers: [TopicsService, topicsRepositoryProvider],
  controllers: [TopicsController],
  exports: [TopicsService],
})
export class TopicsModule {}
