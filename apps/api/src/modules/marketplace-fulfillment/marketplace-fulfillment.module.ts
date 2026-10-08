import { Module } from '@nestjs/common';
import { SellerModule } from '../sellers/seller.module';
import { MarketplaceFulfillmentController } from './marketplace-fulfillment.controller';
import { MarketplaceFulfillmentService } from './marketplace-fulfillment.service';

@Module({
  imports: [SellerModule],
  controllers: [MarketplaceFulfillmentController],
  providers: [MarketplaceFulfillmentService],
  exports: [MarketplaceFulfillmentService],
})
export class MarketplaceFulfillmentModule {}
