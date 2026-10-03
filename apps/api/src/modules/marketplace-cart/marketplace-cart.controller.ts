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
import { AddMarketplaceCartItemDto } from './dto/add-marketplace-cart-item.dto';
import { UpdateMarketplaceCartItemDto } from './dto/update-marketplace-cart-item.dto';
import { MarketplaceCartService } from './marketplace-cart.service';

@Controller('marketplace/cart')
@UseGuards(FeatureGuard)
@RequiresFeature('MARKETPLACE_ENABLED')
export class MarketplaceCartController {
  constructor(private readonly carts: MarketplaceCartService) {}

  @Get()
  getCart(@CurrentUser() user: AuthenticatedUser) {
    return this.carts.getCart(user.id);
  }

  @Post('checkout')
  checkout(@CurrentUser() user: AuthenticatedUser) {
    return this.carts.checkout(user.id);
  }

  @Post('items')
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddMarketplaceCartItemDto,
  ) {
    return this.carts.addItem(user.id, dto);
  }

  @Patch('items/:itemId')
  updateItemQuantity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateMarketplaceCartItemDto,
  ) {
    return this.carts.updateItemQuantity(user.id, itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.carts.removeItem(user.id, itemId);
  }

  @Delete('items')
  clearCart(@CurrentUser() user: AuthenticatedUser) {
    return this.carts.clearCart(user.id);
  }
}
