import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { PROFILES_REPOSITORY } from './profiles.repository';
import { SupabaseProfilesRepository } from './supabase-profiles.repository';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [ConfigModule, SchedulesModule],
  controllers: [ProfilesController],
  providers: [
    ProfilesService,
    {
      provide: PROFILES_REPOSITORY,
      useClass: SupabaseProfilesRepository,
    },
  ],
  exports: [ProfilesService, PROFILES_REPOSITORY],
})
export class ProfilesModule {}
