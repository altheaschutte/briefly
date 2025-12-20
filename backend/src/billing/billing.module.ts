import { forwardRef, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EpisodesModule } from '../episodes/episodes.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BILLING_REPOSITORY } from './billing.repository';
import { SupabaseBillingRepository } from './supabase-billing.repository';
import { EntitlementsService } from './entitlements.service';
import { MeController } from './me.controller';

const billingRepositoryProvider: Provider = {
  provide: BILLING_REPOSITORY,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    return new SupabaseBillingRepository(configService);
  },
};

@Module({
  imports: [ConfigModule, forwardRef(() => EpisodesModule)],
  controllers: [BillingController, MeController],
  providers: [BillingService, EntitlementsService, billingRepositoryProvider],
  exports: [BillingService, EntitlementsService, billingRepositoryProvider],
})
export class BillingModule {}
