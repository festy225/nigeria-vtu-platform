import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { ProvidersModule } from '../providers/providers.module';
import { WalletModule } from '../wallets/wallet.module';

@Module({
  imports: [ProvidersModule, WalletModule],
  controllers: [PaymentController],
  providers: [PaymentService],
})
export class PaymentModule {}