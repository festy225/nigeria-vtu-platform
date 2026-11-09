import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/auth.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminFeesService } from './admin-fees.service';

@Controller('admin/fees')
@Roles('SUPER_ADMIN')
export class AdminFeesController {
  constructor(private readonly fees: AdminFeesService) {}

  @Get('membership-programs')
  listPrograms() {
    return this.fees.listPrograms();
  }

  @Get('membership-payments')
  listMembershipPayments(
    @Query('programCode') programCode?: string,
    @Query('state') state?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.fees.listMembershipPayments(programCode, state, limit, offset);
  }

  @Patch('membership-programs/:code')
  updateProgram(
    @Param('code') code: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fees.updateProgram(code, body, user.id);
  }

  @Get('rules')
  listRules() {
    return this.fees.listRules();
  }

  @Post('rules')
  createRule(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fees.createRule(body, user.id);
  }

  @Patch('rules/:id')
  updateRule(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fees.updateRule(id, body, user.id);
  }
}
