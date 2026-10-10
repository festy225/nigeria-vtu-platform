import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { ProvidersModule } from '../providers/providers.module';
import { WalletModule } from '../wallets/wallet.module';
import { FeatureGuard } from '../../common/features/feature.guard';
import { MarketplaceOrderModule } from '../marketplace-orders/marketplace-order.module';
import { MarketplaceCartModule } from '../marketplace-cart/marketplace-cart.module';

@Module({
  imports: [ProvidersModule, WalletModule, MarketplaceOrderModule, MarketplaceCartModule],
  controllers: [PaymentController],
  providers: [PaymentService, FeatureGuard],
})
export class PaymentModule {}