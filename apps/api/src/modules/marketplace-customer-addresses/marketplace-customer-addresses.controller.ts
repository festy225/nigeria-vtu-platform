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
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';
import { MarketplaceCustomerAddressesService } from './marketplace-customer-addresses.service';

@Controller('marketplace/customer-addresses')
@UseGuards(FeatureGuard)
@RequiresFeature('MARKETPLACE_ENABLED')
export class MarketplaceCustomerAddressesController {
  constructor(
    private readonly addresses: MarketplaceCustomerAddressesService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerAddressDto,
  ) {
    return this.addresses.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.addresses.list(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomerAddressDto,
  ) {
    return this.addresses.update(user.id, id, dto);
  }

  @Delete(':id')
  disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.addresses.disable(user.id, id);
  }
}
