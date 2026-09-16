import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/auth.decorators';
import type { UserRole } from '@nigeria-vtu-platform/shared';

@Controller('authorization-example')
export class AuthorizationExampleController {
  @Get('customer-or-agent') @Roles('CUSTOMER', 'AGENT') customerOrAgent() { return { permitted: true }; }
  @Get('admin-only') @Roles('ADMIN', 'SUPER_ADMIN') adminOnly() { return { permitted: true }; }
}
