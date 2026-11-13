import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Roles } from '../../common/auth/auth.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { KycService } from './kyc.service';

type TestKycOutcome =
  | 'VERIFIED'
  | 'REJECTED'
  | 'MORE_INFORMATION_REQUIRED';

@Controller('admin/testing/kyc')
@Roles('SUPER_ADMIN')
export class KycAdminTestingController {
  constructor(private readonly kyc: KycService) {}

  @Get('status')
  getSimulatorStatus() {
    return this.kyc.getTestSimulatorStatus();
  }

  @Get()
  listVerifications() {
    return this.kyc.listForAdminTesting();
  }

  @Post(':verificationId/simulate')
  simulate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('verificationId', ParseUUIDPipe) verificationId: string,
    @Body() body: { status: TestKycOutcome },
  ) {
    return this.kyc.simulateVerificationStatus(
      verificationId,
      body.status,
      user.id,
    );
  }
}
