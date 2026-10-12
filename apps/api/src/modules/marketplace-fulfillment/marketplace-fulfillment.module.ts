import { Module } from '@nestjs/common';
import { SellerModule } from '../sellers/seller.module';
import { MarketplaceFulfillmentController } from './marketplace-fulfillment.controller';
import { ProvidersModule } from '../providers/providers.module';
import { MarketplaceFulfillmentService } from './marketplace-fulfillment.service';

@Module({
  imports: [SellerModule, ProvidersModule],
  controllers: [MarketplaceFulfillmentController],
  providers: [MarketplaceFulfillmentService],
  exports: [MarketplaceFulfillmentService],
})
export class MarketplaceFulfillmentModule {}
