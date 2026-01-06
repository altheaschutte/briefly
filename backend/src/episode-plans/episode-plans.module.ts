import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EpisodePlansService } from './episode-plans.service';
import { supabaseEpisodePlansRepositoryProvider } from './supabase-episode-plans.repository';

@Module({
  imports: [ConfigModule],
  providers: [EpisodePlansService, supabaseEpisodePlansRepositoryProvider],
  exports: [EpisodePlansService],
})
export class EpisodePlansModule {}
