import { Module } from '@nestjs/common';
import { SellerModule } from '../sellers/seller.module';
import { MarketplaceFulfillmentController } from './marketplace-fulfillment.controller';
import { ProvidersModule } from '../providers/providers.module';
import { MarketplaceFulfillmentService } from './marketplace-fulfillment.service';
import { MarketplaceFulfillmentTrackingWorker } from './marketplace-fulfillment-tracking.worker';

@Module({
  imports: [SellerModule, ProvidersModule],
  controllers: [MarketplaceFulfillmentController],
  providers: [
    MarketplaceFulfillmentService,
    MarketplaceFulfillmentTrackingWorker,
  ],
  exports: [MarketplaceFulfillmentService],
})
export class MarketplaceFulfillmentModule {}
