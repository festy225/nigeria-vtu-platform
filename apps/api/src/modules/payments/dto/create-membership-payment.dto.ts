import { IsIn, IsString, IsUUID, MaxLength } from 'class-validator';

export type MembershipBillingPeriod = 'MONTHLY' | 'ANNUAL';

export class CreateMembershipPaymentDto {
  @IsUUID()
  membershipProgramId!: string;

  @IsIn(['MONTHLY', 'ANNUAL'])
  billingPeriod!: MembershipBillingPeriod;

  @IsString()
  @MaxLength(160)
  idempotencyKey!: string;
}
