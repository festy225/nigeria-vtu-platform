import { IsUUID } from 'class-validator';

export class AcceptMembershipTermsDto {
  @IsUUID()
  membershipProgramId!: string;
}
