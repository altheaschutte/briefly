import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { TopicsModule } from './topics/topics.module';
import { EpisodesModule } from './episodes/episodes.module';
import { QueueModule } from './queue/queue.module';
import { LlmModule } from './llm/llm.module';
import { TtsModule } from './tts/tts.module';
import { PerplexityModule } from './perplexity/perplexity.module';
import { StorageModule } from './storage/storage.module';
import { CommonModule } from './common/common.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { BillingModule } from './billing/billing.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    AuthModule,
    TopicsModule,
    EpisodesModule,
    QueueModule,
    LlmModule,
    TtsModule,
    PerplexityModule,
    StorageModule,
    OnboardingModule,
    BillingModule,
    HealthModule,
  ],
})
export class AppModule {}
