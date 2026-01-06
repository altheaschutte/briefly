import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EpisodesModule } from '../episodes/episodes.module';
import { BillingModule } from '../billing/billing.module';
import { QueueModule } from '../queue/queue.module';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { SchedulesRunnerService } from './schedules-runner.service';
import { SCHEDULES_REPOSITORY } from './schedules.repository';
import { SupabaseSchedulesRepository } from './supabase-schedules.repository';

@Module({
  imports: [ConfigModule, EpisodesModule, BillingModule, QueueModule],
  controllers: [SchedulesController],
  providers: [
    SchedulesService,
    SchedulesRunnerService,
    {
      provide: SCHEDULES_REPOSITORY,
      useClass: SupabaseSchedulesRepository,
    },
  ],
  exports: [SchedulesService, SchedulesRunnerService, SCHEDULES_REPOSITORY],
})
export class SchedulesModule {}
