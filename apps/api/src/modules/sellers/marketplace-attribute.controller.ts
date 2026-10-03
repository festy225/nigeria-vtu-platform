import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public, Roles } from '../../common/auth/auth.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FeatureGuard } from '../../common/features/feature.guard';
import { RequiresFeature } from '../../common/features/feature.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateMarketplaceAttributeDto } from './dto/create-marketplace-attribute.dto';
import { UpdateMarketplaceAttributeDto } from './dto/update-marketplace-attribute.dto';
import { CreateMarketplaceAttributeValueDto } from './dto/create-marketplace-attribute-value.dto';
import { UpdateMarketplaceAttributeValueDto } from './dto/update-marketplace-attribute-value.dto';
import { MarketplaceAttributeService } from './marketplace-attribute.service';

@Controller()
@UseGuards(FeatureGuard)
export class MarketplaceAttributeController {
  constructor(private readonly attributes: MarketplaceAttributeService) {}

  @Get('marketplace/categories/:categoryId/attributes')
  @Public()
  @RequiresFeature('MARKETPLACE_ENABLED')
  listEnabledCategoryAttributes(
    @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
  ) {
    return this.attributes.listEnabledCategoryAttributes(categoryId);
  }

  @Get('marketplace/attributes/:attributeId/values')
  @Public()
  @RequiresFeature('MARKETPLACE_ENABLED')
  listEnabledAttributeValues(
    @Param('attributeId', new ParseUUIDPipe()) attributeId: string,
  ) {
    return this.attributes.listEnabledAttributeValues(attributeId);
  }

  @Get('admin/marketplace/categories/:categoryId/attributes')
  @Roles('SUPER_ADMIN')
  listCategoryAttributes(
    @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
  ) {
    return this.attributes.listCategoryAttributes(categoryId);
  }

  @Post('admin/marketplace/categories/:categoryId/attributes')
  @Roles('SUPER_ADMIN')
  createAttribute(
    @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMarketplaceAttributeDto,
  ) {
    return this.attributes.createAttribute(user.id, categoryId, dto);
  }

  @Patch('admin/marketplace/attributes/:attributeId')
  @Roles('SUPER_ADMIN')
  updateAttribute(
    @Param('attributeId', new ParseUUIDPipe()) attributeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMarketplaceAttributeDto,
  ) {
    return this.attributes.updateAttribute(user.id, attributeId, dto);
  }

  @Get('admin/marketplace/attributes/:attributeId/values')
  @Roles('SUPER_ADMIN')
  listAttributeValues(
    @Param('attributeId', new ParseUUIDPipe()) attributeId: string,
  ) {
    return this.attributes.listAttributeValues(attributeId);
  }

  @Post('admin/marketplace/attributes/:attributeId/values')
  @Roles('SUPER_ADMIN')
  createAttributeValue(
    @Param('attributeId', new ParseUUIDPipe()) attributeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMarketplaceAttributeValueDto,
  ) {
    return this.attributes.createAttributeValue(user.id, attributeId, dto);
  }

  @Patch('admin/marketplace/attribute-values/:valueId')
  @Roles('SUPER_ADMIN')
  updateAttributeValue(
    @Param('valueId', new ParseUUIDPipe()) valueId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMarketplaceAttributeValueDto,
  ) {
    return this.attributes.updateAttributeValue(user.id, valueId, dto);
  }
}
