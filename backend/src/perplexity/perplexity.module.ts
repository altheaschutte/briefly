import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PerplexityService } from './perplexity.service';

@Module({
  imports: [ConfigModule],
  providers: [PerplexityService],
  exports: [PerplexityService],
})
export class PerplexityModule {}
