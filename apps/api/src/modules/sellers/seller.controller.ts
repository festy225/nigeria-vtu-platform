import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/auth/auth.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FeatureGuard } from '../../common/features/feature.guard';
import { RequiresFeature } from '../../common/features/feature.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateSellerApplicationDto } from './seller.dtos';
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
}
