import { Body, Controller, Get, NotFoundException, Param, Patch } from '@nestjs/common';
import { Roles } from '../../common/auth/auth.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FeatureService } from './feature.service';

@Controller('features')
export class FeatureController {
  constructor(private readonly features: FeatureService) {}

  @Get()
  list() {
    return this.features.list();
  }

  @Patch(':key')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async update(
    @Param('key') key: string,
    @Body() body: { enabled: boolean },
    @CurrentUser() user: AuthenticatedUser
  ) {
    const updated = await this.features.setEnabled(key, body.enabled, user.id);
    if (!updated) throw new NotFoundException('Feature toggle not found');
    return updated;
  }
}
