import { Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { DEVICE_TOKENS_REPOSITORY } from './device-tokens.repository';
import { SupabaseDeviceTokensRepository } from './supabase-device-tokens.repository';

const deviceTokensRepositoryProvider: Provider = {
  provide: DEVICE_TOKENS_REPOSITORY,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => new SupabaseDeviceTokensRepository(configService),
};

@Module({
  imports: [ConfigModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, deviceTokensRepositoryProvider],
  exports: [NotificationsService, deviceTokensRepositoryProvider],
})
export class NotificationsModule {}
