import { Module } from '@nestjs/common';
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

@Module({
  imports: [ConfigModule, QueueModule, TopicsModule, LlmModule, PerplexityModule, TtsModule, StorageModule],
  controllers: [EpisodesController],
  providers: [EpisodesService, EpisodeProcessorService],
  exports: [EpisodesService, EpisodeProcessorService],
})
export class EpisodesModule {}
