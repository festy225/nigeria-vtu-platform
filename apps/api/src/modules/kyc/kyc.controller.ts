import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { KycService } from './kyc.service';

@Controller('sellers/kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Post('application')
  async initiate(@CurrentUser() user: AuthenticatedUser) {
    const verification = await this.kyc.startForApprovedSeller(user.id);
    return this.toSellerResponse(verification);
  }

  @Get('application')
  async getStatus(@CurrentUser() user: AuthenticatedUser) {
    const verification = await this.kyc.getForAuthenticatedUser(user.id);
    return this.toSellerResponse(verification);
  }

  private toSellerResponse(verification: {
    id: string;
    status: string;
    submittedAt: Date | null;
    verifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: verification.id,
      status: verification.status,
      submittedAt: verification.submittedAt,
      verifiedAt: verification.verifiedAt,
      createdAt: verification.createdAt,
      updatedAt: verification.updatedAt,
    };
  }
}
