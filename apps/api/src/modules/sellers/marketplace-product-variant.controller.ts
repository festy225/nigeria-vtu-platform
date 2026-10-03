import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FeatureGuard } from '../../common/features/feature.guard';
import { RequiresFeature } from '../../common/features/feature.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateMarketplaceProductVariantDto } from './dto/create-marketplace-product-variant.dto';
import { UpdateMarketplaceProductVariantDto } from './dto/update-marketplace-product-variant.dto';
import { MarketplaceProductVariantService } from './marketplace-product-variant.service';

@Controller('sellers/products/:productId/variants')
@UseGuards(FeatureGuard)
@RequiresFeature('SELLER_STORES_ENABLED')
export class MarketplaceProductVariantController {
  constructor(
    private readonly variants: MarketplaceProductVariantService,
  ) {}

  @Post()
  createVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: CreateMarketplaceProductVariantDto,
  ) {
    return this.variants.createVariant(user.id, productId, dto);
  }

  @Get()
  listVariants(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
  ) {
    return this.variants.listVariants(user.id, productId);
  }

  @Get(':variantId')
  getVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
  ) {
    return this.variants.getVariant(user.id, productId, variantId);
  }

  @Patch(':variantId')
  updateVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() dto: UpdateMarketplaceProductVariantDto,
  ) {
    return this.variants.updateVariant(
      user.id,
      productId,
      variantId,
      dto,
    );
  }

  @Delete(':variantId')
  async deleteVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
  ) {
    await this.variants.deleteVariant(user.id, productId, variantId);
    return { deleted: true };
  }
}
