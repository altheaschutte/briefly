import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EpisodesService } from './episodes.service';
import { EpisodesController } from './episodes.controller';
import { QueueModule } from '../queue/queue.module';
import { TopicsModule } from '../topics/topics.module';
import { LlmModule } from '../llm/llm.module';
import { PerplexityModule } from '../perplexity/perplexity.module';
import { TtsModule } from '../tts/tts.module';
import { StorageModule } from '../storage/storage.module';
import { EpisodeProcessorService } from './episode-processor.service';
import { Provider } from '@nestjs/common';
import { EPISODES_REPOSITORY } from './episodes.repository';
import { ConfigService } from '@nestjs/config';
import { InMemoryStoreService } from '../common/in-memory-store.service';
import { InMemoryEpisodesRepository } from './in-memory-episodes.repository';
import { SupabaseEpisodesRepository } from './supabase-episodes.repository';
import { EpisodeSourcesService } from './episode-sources.service';
import { EPISODE_SOURCES_REPOSITORY } from './episode-sources.repository';
import { InMemoryEpisodeSourcesRepository } from './in-memory-episode-sources.repository';
import { SupabaseEpisodeSourcesRepository } from './supabase-episode-sources.repository';
import { TopicQueriesModule } from '../topic-queries/topic-queries.module';
import { CoverImageService } from './cover-image.service';
import { EpisodeSegmentsService } from './episode-segments.service';
import { EPISODE_SEGMENTS_REPOSITORY } from './episode-segments.repository';
import { InMemoryEpisodeSegmentsRepository } from './in-memory-episode-segments.repository';
import { SupabaseEpisodeSegmentsRepository } from './supabase-episode-segments.repository';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SegmentDiveDeeperSeedsService } from './segment-dive-deeper-seeds.service';
import { SEGMENT_DIVE_DEEPER_SEEDS_REPOSITORY } from './segment-dive-deeper-seeds.repository';
import { InMemorySegmentDiveDeeperSeedsRepository } from './in-memory-segment-dive-deeper-seeds.repository';
import { SupabaseSegmentDiveDeeperSeedsRepository } from './supabase-segment-dive-deeper-seeds.repository';

const episodesRepositoryProvider: Provider = {
  provide: EPISODES_REPOSITORY,
  inject: [ConfigService, InMemoryStoreService],
  useFactory: (configService: ConfigService, store: InMemoryStoreService) => {
    const supabaseUrl = configService.get<string>('SUPABASE_PROJECT_URL');
    const supabaseKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const storagePref = (configService.get<string>('EPISODES_STORAGE') || 'auto').toLowerCase();
    const canUseSupabase = Boolean(supabaseUrl && supabaseKey);

    if (storagePref === 'memory' || (!canUseSupabase && storagePref === 'auto')) {
      return new InMemoryEpisodesRepository(store);
    }
    if (!canUseSupabase) {
      throw new Error('EPISODES_STORAGE is set to supabase but Supabase env vars are missing');
    }
    return new SupabaseEpisodesRepository(configService);
  },
};

const episodeSourcesRepositoryProvider: Provider = {
  provide: EPISODE_SOURCES_REPOSITORY,
  inject: [ConfigService, InMemoryStoreService],
  useFactory: (configService: ConfigService, store: InMemoryStoreService) => {
    const supabaseUrl = configService.get<string>('SUPABASE_PROJECT_URL');
    const supabaseKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const storagePref = (configService.get<string>('EPISODES_STORAGE') || 'auto').toLowerCase();
    const canUseSupabase = Boolean(supabaseUrl && supabaseKey);

    if (storagePref === 'memory' || (!canUseSupabase && storagePref === 'auto')) {
      return new InMemoryEpisodeSourcesRepository(store);
    }
    if (!canUseSupabase) {
      throw new Error('EPISODES_STORAGE is set to supabase but Supabase env vars are missing');
    }
    return new SupabaseEpisodeSourcesRepository(configService);
  },
};

	const episodeSegmentsRepositoryProvider: Provider = {
	  provide: EPISODE_SEGMENTS_REPOSITORY,
	  inject: [ConfigService, InMemoryStoreService],
	  useFactory: (configService: ConfigService, store: InMemoryStoreService) => {
    const supabaseUrl = configService.get<string>('SUPABASE_PROJECT_URL');
    const supabaseKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const storagePref = (configService.get<string>('EPISODES_STORAGE') || 'auto').toLowerCase();
    const canUseSupabase = Boolean(supabaseUrl && supabaseKey);

    if (storagePref === 'memory' || (!canUseSupabase && storagePref === 'auto')) {
      return new InMemoryEpisodeSegmentsRepository(store);
    }
    if (!canUseSupabase) {
      throw new Error('EPISODES_STORAGE is set to supabase but Supabase env vars are missing');
    }
	    return new SupabaseEpisodeSegmentsRepository(configService);
	  },
	};

const segmentDiveDeeperSeedsRepositoryProvider: Provider = {
  provide: SEGMENT_DIVE_DEEPER_SEEDS_REPOSITORY,
  inject: [ConfigService, InMemoryStoreService],
  useFactory: (configService: ConfigService, store: InMemoryStoreService) => {
    const supabaseUrl = configService.get<string>('SUPABASE_PROJECT_URL');
    const supabaseKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const storagePref = (configService.get<string>('EPISODES_STORAGE') || 'auto').toLowerCase();
    const canUseSupabase = Boolean(supabaseUrl && supabaseKey);

    if (storagePref === 'memory' || (!canUseSupabase && storagePref === 'auto')) {
      return new InMemorySegmentDiveDeeperSeedsRepository(store);
    }
    if (!canUseSupabase) {
      throw new Error('EPISODES_STORAGE is set to supabase but Supabase env vars are missing');
    }
    return new SupabaseSegmentDiveDeeperSeedsRepository(configService);
  },
};

@Module({
  imports: [
    ConfigModule,
    QueueModule,
    forwardRef(() => TopicsModule),
    TopicQueriesModule,
    LlmModule,
    PerplexityModule,
    TtsModule,
    StorageModule,
    NotificationsModule,
    forwardRef(() => BillingModule),
  ],
  controllers: [EpisodesController],
	  providers: [
	    EpisodesService,
	    EpisodeProcessorService,
	    EpisodeSourcesService,
	    EpisodeSegmentsService,
	    SegmentDiveDeeperSeedsService,
	    CoverImageService,
	    episodesRepositoryProvider,
	    episodeSourcesRepositoryProvider,
	    episodeSegmentsRepositoryProvider,
	    segmentDiveDeeperSeedsRepositoryProvider,
	  ],
	  exports: [
	    EpisodesService,
	    EpisodeProcessorService,
	    EpisodeSourcesService,
	    EpisodeSegmentsService,
	    SegmentDiveDeeperSeedsService,
	  ],
	})
export class EpisodesModule {}
