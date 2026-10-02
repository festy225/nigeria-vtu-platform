import { Module } from '@nestjs/common';
import { FeatureGuard } from '../../common/features/feature.guard';
import { SellerController } from './seller.controller';
import { SellerService } from './seller.service';


@Module({
  controllers: [SellerController],
  providers: [SellerService, FeatureGuard],
  exports: [SellerService],
})
export class SellerModule {}
