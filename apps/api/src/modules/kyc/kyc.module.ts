import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { KycProviderRouterService } from '../providers/routing/kyc-provider-router.service';
import { KycController } from './kyc.controller';
import { KycAdminTestingController } from './kyc-admin-testing.controller';
import { KycService } from './kyc.service';

@Module({
  imports: [ProvidersModule],
  controllers: [KycController, KycAdminTestingController],
  providers: [KycProviderRouterService, KycService],
  exports: [KycService],
})
export class KycModule {}
