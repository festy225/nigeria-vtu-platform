import { Module } from '@nestjs/common';
import { MembershipTermsController } from './membership-terms.controller';
import { MembershipProgramsController } from './membership-programs.controller';
import { MembershipTermsService } from './membership-terms.service';
import { AdminFeesController } from './admin-fees.controller';
import { AdminFeesService } from './admin-fees.service';

@Module({
  controllers: [MembershipTermsController, MembershipProgramsController, AdminFeesController],
  providers: [MembershipTermsService, AdminFeesService],
})
export class MembershipModule {}
