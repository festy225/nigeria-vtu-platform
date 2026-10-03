import { Module } from '@nestjs/common';
import { FeatureGuard } from '../../common/features/feature.guard';
import { AuditModule } from '../audit/audit.module';
import { SellerController } from './seller.controller';
import { SellerService } from './seller.service';
import { MarketplaceCategoryController } from './marketplace-category.controller';
import { MarketplaceCategoryService } from './marketplace-category.service';
import { MarketplaceAttributeController } from './marketplace-attribute.controller';
import { MarketplaceAttributeService } from './marketplace-attribute.service';
import { MarketplaceProductAttributeController } from './marketplace-product-attribute.controller';
import { MarketplaceProductAttributeService } from './marketplace-product-attribute.service';
import { MarketplaceProductVariantController } from './marketplace-product-variant.controller';
import { MarketplaceProductVariantService } from './marketplace-product-variant.service';
import {
  MarketplaceProductInventoryController,
  MarketplaceVariantInventoryController,
} from './marketplace-inventory.controller';
import { MarketplaceInventoryService } from './marketplace-inventory.service';
import { MarketplaceCatalogController } from './marketplace-catalog.controller';
import { MarketplaceCatalogService } from './marketplace-catalog.service';

@Module({
  imports: [AuditModule],
  controllers: [
    SellerController,
    MarketplaceCategoryController,
    MarketplaceAttributeController,
    MarketplaceProductAttributeController,
    MarketplaceProductVariantController,
    MarketplaceProductInventoryController,
    MarketplaceVariantInventoryController,
    MarketplaceCatalogController,
  ],
  providers: [
    SellerService,
    MarketplaceCategoryService,
    MarketplaceAttributeService,
    MarketplaceProductAttributeService,
    MarketplaceProductVariantService,
    MarketplaceInventoryService,
    MarketplaceCatalogService,
    FeatureGuard,
  ],
  exports: [SellerService],
})
export class SellerModule {}
