import { Logger, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { InMemoryTopicQueriesRepository } from './in-memory-topic-queries.repository';
import { SupabaseTopicQueriesRepository } from './supabase-topic-queries.repository';
import { TOPIC_QUERIES_REPOSITORY } from './topic-queries.repository';
import { TopicQueriesService } from './topic-queries.service';

const topicQueriesRepositoryProvider: Provider = {
  provide: TOPIC_QUERIES_REPOSITORY,
  inject: [ConfigService, InMemoryStoreService],
  useFactory: (configService: ConfigService, store: InMemoryStoreService) => {
    const logger = new Logger('TopicQueriesModule');
    const storagePref = (configService.get<string>('TOPIC_QUERIES_STORAGE') || 'auto').toLowerCase();
    const supabaseUrl = configService.get<string>('SUPABASE_PROJECT_URL');
    const supabaseKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    const canUseSupabase = Boolean(supabaseUrl && supabaseKey);
    if (storagePref === 'memory' || (!canUseSupabase && storagePref === 'auto')) {
      if (storagePref !== 'memory' && !canUseSupabase) {
        logger.warn('Supabase env vars missing; falling back to in-memory topic queries store');
      }
      return new InMemoryTopicQueriesRepository(store);
    }
    if (!canUseSupabase) {
      throw new Error('TOPIC_QUERIES_STORAGE is set to supabase but Supabase env vars are missing');
    }
    return new SupabaseTopicQueriesRepository(configService);
  },
};

@Module({
  imports: [ConfigModule],
  providers: [TopicQueriesService, topicQueriesRepositoryProvider],
  exports: [TopicQueriesService, topicQueriesRepositoryProvider],
})
export class TopicQueriesModule {}
