import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AcceptMembershipTermsDto } from './dto/accept-membership-terms.dto';
import { MembershipTermsService } from './membership-terms.service';

@Controller('membership/terms-acceptances')
export class MembershipTermsController {
  constructor(private readonly membershipTerms: MembershipTermsService) {}

  @Post()
  acceptCurrentTerms(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcceptMembershipTermsDto,
  ) {
    return this.membershipTerms.acceptCurrentTerms(
      user.id,
      dto.membershipProgramId,
    );
  }
}
