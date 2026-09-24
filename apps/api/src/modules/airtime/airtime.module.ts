import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { WalletModule } from '../wallets/wallet.module';
import { FeatureModule } from '../features/feature.module';
import { AirtimeController } from './airtime.controller';
import { AirtimeService } from './airtime.service';

@Module({
  imports: [
    ProvidersModule,
    WalletModule,
    FeatureModule,
  ],
  controllers: [AirtimeController],
  providers: [AirtimeService],
})
export class AirtimeModule {}