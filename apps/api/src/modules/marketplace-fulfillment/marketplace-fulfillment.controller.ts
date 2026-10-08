import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FeatureGuard } from '../../common/features/feature.guard';
import { RequiresFeature } from '../../common/features/feature.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateSellerFulfillmentDto } from './dto/create-seller-fulfillment.dto';
import { CheckFulfillmentServiceabilityDto } from './dto/check-fulfillment-serviceability.dto';
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
}
