import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FeatureGuard } from '../../common/features/feature.guard';
import { RequiresFeature } from '../../common/features/feature.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SetMarketplaceInventoryDto } from './dto/set-marketplace-inventory.dto';
import { MarketplaceInventoryService } from './marketplace-inventory.service';

@Controller('sellers/products/:productId/inventory')
@UseGuards(FeatureGuard)
@RequiresFeature('SELLER_STORES_ENABLED')
export class MarketplaceProductInventoryController {
  constructor(private readonly inventory: MarketplaceInventoryService) {}

  @Get()
  getInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
  ) {
    return this.inventory.getProductInventory(user.id, productId);
  }

  @Put()
  setInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: SetMarketplaceInventoryDto,
  ) {
    return this.inventory.setProductInventory(
      user.id,
      productId,
      dto.onHandQuantity,
    );
  }

  @Delete()
  async deleteInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
  ) {
    await this.inventory.deleteProductInventory(user.id, productId);
    return { deleted: true };
  }
}

@Controller('sellers/products/:productId/variants/:variantId/inventory')
@UseGuards(FeatureGuard)
@RequiresFeature('SELLER_STORES_ENABLED')
export class MarketplaceVariantInventoryController {
  constructor(private readonly inventory: MarketplaceInventoryService) {}

  @Get()
  getInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
  ) {
    return this.inventory.getVariantInventory(user.id, productId, variantId);
  }

  @Put()
  setInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() dto: SetMarketplaceInventoryDto,
  ) {
    return this.inventory.setVariantInventory(
      user.id,
      productId,
      variantId,
      dto.onHandQuantity,
    );
  }
}
