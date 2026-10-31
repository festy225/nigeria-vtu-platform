import { Controller, Get } from '@nestjs/common';
import { MembershipTermsService } from './membership-terms.service';

@Controller('membership')
export class MembershipProgramsController {
  constructor(private readonly membershipTerms: MembershipTermsService) {}

  @Get('programs')
  listEnabledPrograms() {
    return this.membershipTerms.listEnabledPrograms();
  }
}