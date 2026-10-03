import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { ProvidersModule } from '../providers/providers.module';
import { WalletModule } from '../wallets/wallet.module';
import { FeatureGuard } from '../../common/features/feature.guard';

@Module({
  imports: [ProvidersModule, WalletModule],
  controllers: [PaymentController],
  providers: [PaymentService, FeatureGuard],
})
export class PaymentModule {}