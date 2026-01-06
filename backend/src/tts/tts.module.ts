import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';
import { OpenAiTtsProvider } from './openai-tts.provider';
import { TTS_PROVIDER_TOKEN } from './tts.constants';
import { TtsProvider } from './tts.interfaces';
import { TtsService } from './tts.service';

@Module({
  imports: [ConfigModule, StorageModule],
  providers: [
    {
      provide: TTS_PROVIDER_TOKEN,
      inject: [ConfigService, StorageService],
      useFactory: (configService: ConfigService, storageService: StorageService): TtsProvider => {
        return new OpenAiTtsProvider(configService, storageService); // provider/model fixed in code; env only for secrets
      },
    },
    TtsService,
  ],
  exports: [TtsService, TTS_PROVIDER_TOKEN],
})
export class TtsModule {}
