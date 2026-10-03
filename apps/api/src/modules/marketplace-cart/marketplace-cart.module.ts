import { Module } from '@nestjs/common';
import { FeatureGuard } from '../../common/features/feature.guard';
import { MarketplaceOrderModule } from '../marketplace-orders/marketplace-order.module';
import { MarketplaceCartController } from './marketplace-cart.controller';
import { MarketplaceCartService } from './marketplace-cart.service';

@Module({
  imports: [MarketplaceOrderModule],
  controllers: [MarketplaceCartController],
  providers: [MarketplaceCartService, FeatureGuard],
})
export class MarketplaceCartModule {}
