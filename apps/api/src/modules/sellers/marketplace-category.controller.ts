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
import { CreateMarketplaceCategoryDto } from './dto/create-marketplace-category.dto';
import { UpdateMarketplaceCategoryDto } from './dto/update-marketplace-category.dto';
import { MarketplaceCategoryService } from './marketplace-category.service';

@Controller()
@UseGuards(FeatureGuard)
export class MarketplaceCategoryController {
  constructor(private readonly categories: MarketplaceCategoryService) {}

  @Get('marketplace/categories')
  @Public()
  @RequiresFeature('MARKETPLACE_ENABLED')
  listEnabledCategories() {
    return this.categories.listEnabledCategories();
  }

  @Get('marketplace/categories/:id')
  @Public()
  @RequiresFeature('MARKETPLACE_ENABLED')
  getEnabledCategory(@Param('id', new ParseUUIDPipe()) categoryId: string) {
    return this.categories.getEnabledCategory(categoryId);
  }

  @Get('admin/marketplace/categories')
  @Roles('SUPER_ADMIN')
  listAllCategories() {
    return this.categories.listAllCategories();
  }

  @Post('admin/marketplace/categories')
  @Roles('SUPER_ADMIN')
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMarketplaceCategoryDto,
  ) {
    return this.categories.createCategory(user.id, dto);
  }

  @Patch('admin/marketplace/categories/:id')
  @Roles('SUPER_ADMIN')
  updateCategory(
    @Param('id', new ParseUUIDPipe()) categoryId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMarketplaceCategoryDto,
  ) {
    return this.categories.updateCategory(user.id, categoryId, dto);
  }
}
