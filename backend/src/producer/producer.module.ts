import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EpisodePlansModule } from '../episode-plans/episode-plans.module';
import { EpisodesModule } from '../episodes/episodes.module';
import { QueueModule } from '../queue/queue.module';
import { BillingModule } from '../billing/billing.module';
import { ProducerController } from './producer.controller';

@Module({
  imports: [ConfigModule, EpisodePlansModule, EpisodesModule, QueueModule, BillingModule],
  controllers: [ProducerController],
})
export class ProducerModule {}
