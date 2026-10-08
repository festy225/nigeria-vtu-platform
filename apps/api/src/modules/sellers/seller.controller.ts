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
import { Roles } from '../../common/auth/auth.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FeatureGuard } from '../../common/features/feature.guard';
import { RequiresFeature } from '../../common/features/feature.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateSellerLocationDto } from './dto/create-seller-location.dto';
import {
  CreateMarketplaceProductDto,
} from './dto/create-marketplace-product.dto';
import {
  UpdateMarketplaceProductDto,
} from './dto/update-marketplace-product.dto';
import {
  CreateSellerApplicationDto,
  ReviewSellerApplicationDto,
} from './seller.dtos';
import { SellerService } from './seller.service';

@Controller('sellers')
@UseGuards(FeatureGuard)
export class SellerController {
  constructor(private readonly sellers: SellerService) {}

  @Get('applications')
  @Roles('SUPER_ADMIN')
  @RequiresFeature('SELLER_STORES_ENABLED')
  listApplications() {
    return this.sellers.listApplications();
  }

  @Patch('applications/:id/review')
  @Roles('SUPER_ADMIN')
  @RequiresFeature('SELLER_STORES_ENABLED')
  reviewApplication(
    @Param('id', new ParseUUIDPipe()) applicationId: string,
    @CurrentUser() reviewer: AuthenticatedUser,
    @Body() dto: ReviewSellerApplicationDto,
  ) {
    return this.sellers.reviewApplication(
      applicationId,
      reviewer.id,
      dto,
    );
  }

  @Post('application')
  @RequiresFeature('SELLER_STORES_ENABLED')
  createApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSellerApplicationDto,
  ) {
    return this.sellers.createApplication(user.id, dto);
  }

  @Get('application')
  @RequiresFeature('SELLER_STORES_ENABLED')
  getApplication(@CurrentUser() user: AuthenticatedUser) {
    return this.sellers.getApplication(user.id);
  }

  @Get('locations')
  @RequiresFeature('SELLER_STORES_ENABLED')
  listSellerLocations(@CurrentUser() user: AuthenticatedUser) {
    return this.sellers.listSellerLocations(user.id);
  }

  @Post('locations')
  @RequiresFeature('SELLER_STORES_ENABLED')
  createSellerLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSellerLocationDto,
  ) {
    return this.sellers.createSellerLocation(user.id, dto);
  }

  @Post('products')
  @RequiresFeature('SELLER_STORES_ENABLED')
  createProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMarketplaceProductDto,
  ) {
    return this.sellers.createProduct(user.id, dto);
  }

  @Get('orders')
  @RequiresFeature('SELLER_STORES_ENABLED')
  listSellerOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.sellers.listSellerOrders(user.id);
  }

  @Get('products')
  @RequiresFeature('SELLER_STORES_ENABLED')
  listSellerProducts(@CurrentUser() user: AuthenticatedUser) {
    return this.sellers.listSellerProducts(user.id);
  }

  @Get('products/:id')
  @RequiresFeature('SELLER_STORES_ENABLED')
  getSellerProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) productId: string,
  ) {
    return this.sellers.getSellerProduct(user.id, productId);
  }

  @Patch('products/:id')
  @RequiresFeature('SELLER_STORES_ENABLED')
  updateSellerProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) productId: string,
    @Body() dto: UpdateMarketplaceProductDto,
  ) {
    return this.sellers.updateSellerProduct(user.id, productId, dto);
  }
}
