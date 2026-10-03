import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { KycProviderRouterService } from '../providers/routing/kyc-provider-router.service';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

@Module({
  imports: [ProvidersModule],
  controllers: [KycController],
  providers: [KycProviderRouterService, KycService],
  exports: [KycService],
})
export class KycModule {}
