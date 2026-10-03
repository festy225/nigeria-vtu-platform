import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MarketplaceOrderService } from './marketplace-order.service';
import { MarketplacePriceResolver } from './marketplace-price-resolver.service';

@Module({
  imports: [AuditModule],
  providers: [MarketplaceOrderService, MarketplacePriceResolver],
  exports: [MarketplaceOrderService, MarketplacePriceResolver],
})
export class MarketplaceOrderModule {}
