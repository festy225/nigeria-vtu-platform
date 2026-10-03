import { Module } from '@nestjs/common';
import { MembershipTermsController } from './membership-terms.controller';
import { MembershipTermsService } from './membership-terms.service';

@Module({
  controllers: [MembershipTermsController],
  providers: [MembershipTermsService],
})
export class MembershipModule {}
