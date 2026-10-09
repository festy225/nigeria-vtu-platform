import { Module } from '@nestjs/common';
import { FeatureGuard } from '../../common/features/feature.guard';
import { MarketplaceCustomerAddressesController } from './marketplace-customer-addresses.controller';
import { MarketplaceCustomerAddressesService } from './marketplace-customer-addresses.service';

@Module({
  controllers: [MarketplaceCustomerAddressesController],
  providers: [
    MarketplaceCustomerAddressesService,
    FeatureGuard,
  ],
  exports: [MarketplaceCustomerAddressesService],
})
export class MarketplaceCustomerAddressesModule {}
