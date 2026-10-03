import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/auth/auth.decorators';
import { FeatureGuard } from '../../common/features/feature.guard';
import { RequiresFeature } from '../../common/features/feature.decorator';
import { MarketplaceCatalogService } from './marketplace-catalog.service';

@Controller('marketplace/products')
@UseGuards(FeatureGuard)
@RequiresFeature('MARKETPLACE_ENABLED')
export class MarketplaceCatalogController {
  constructor(private readonly catalog: MarketplaceCatalogService) {}

  @Get()
  @Public()
  listProducts() {
    return this.catalog.listProducts();
  }

  @Get(':id')
  @Public()
  getProduct(@Param('id', new ParseUUIDPipe()) productId: string) {
    return this.catalog.getProduct(productId);
  }
}
