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
import { ReplaceProductAttributesDto } from './dto/replace-product-attributes.dto';
import { MarketplaceProductAttributeService } from './marketplace-product-attribute.service';

@Controller('sellers/products')
@UseGuards(FeatureGuard)
@RequiresFeature('SELLER_STORES_ENABLED')
export class MarketplaceProductAttributeController {
  constructor(
    private readonly productAttributes: MarketplaceProductAttributeService,
  ) {}

  @Get(':productId/attributes')
  getAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
  ) {
    return this.productAttributes.getAssignments(user.id, productId);
  }

  @Put(':productId/attributes')
  replaceAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: ReplaceProductAttributesDto,
  ) {
    return this.productAttributes.replaceAssignments(
      user.id,
      productId,
      dto,
    );
  }

  @Delete(':productId/attributes/:attributeId')
  async removeAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('attributeId', new ParseUUIDPipe()) attributeId: string,
  ) {
    await this.productAttributes.removeAssignment(
      user.id,
      productId,
      attributeId,
    );
    return { removed: true };
  }
}
