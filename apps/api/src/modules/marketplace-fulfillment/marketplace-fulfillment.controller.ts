import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FeatureGuard } from '../../common/features/feature.guard';
import { RequiresFeature } from '../../common/features/feature.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CheckFulfillmentServiceabilityDto } from './dto/check-fulfillment-serviceability.dto';
import { CreateSellerFulfillmentDto } from './dto/create-seller-fulfillment.dto';
import { FindSellerFulfillmentOfficesDto } from './dto/find-seller-fulfillment-offices.dto';
import { SelectSellerFulfillmentOfficeDto } from './dto/select-seller-fulfillment-office.dto';
import { MarketplaceFulfillmentService } from './marketplace-fulfillment.service';

@Controller('marketplace/fulfillment')
@UseGuards(FeatureGuard)
export class MarketplaceFulfillmentController {
  constructor(
    private readonly fulfillment: MarketplaceFulfillmentService,
  ) {}

  @Post()
  @RequiresFeature('MARKETPLACE_DELIVERY_ENABLED')
  createSellerFulfillment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSellerFulfillmentDto,
  ) {
    return this.fulfillment.createSellerFulfillment(
      dto.orderId,
      user.id,
      dto.customerAddressId,
      dto.sellerLocationId,
    );
  }

  @Post('serviceability')
  @RequiresFeature('MARKETPLACE_DELIVERY_ENABLED')
  checkSellerFulfillmentServiceability(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckFulfillmentServiceabilityDto,
  ) {
    return this.fulfillment.checkSellerFulfillmentServiceability(
      dto.orderId,
      user.id,
    );
  }

  @Get(':orderId/offices')
  @RequiresFeature('MARKETPLACE_DELIVERY_ENABLED')
  findSellerFulfillmentOffices(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Query() dto: FindSellerFulfillmentOfficesDto,
  ) {
    return this.fulfillment.findSellerFulfillmentOffices(
      orderId,
      user.id,
      dto.radiusKm,
    );
  }

  @Post(':orderId/book')
  @RequiresFeature('MARKETPLACE_DELIVERY_ENABLED')
  bookSellerFulfillment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.fulfillment.bookSellerFulfillment(orderId, user.id);
  }

  @Post(':orderId/office')
  @RequiresFeature('MARKETPLACE_DELIVERY_ENABLED')
  selectSellerFulfillmentOffice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: SelectSellerFulfillmentOfficeDto,
  ) {
    return this.fulfillment.selectSellerFulfillmentOffice(
      orderId,
      user.id,
      dto.providerOfficeId,
    );
  }
}
