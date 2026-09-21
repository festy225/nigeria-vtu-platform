import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';

export class FundWalletDto {
  @IsUUID()
  walletId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsIn(['NGN', 'USD'])
  currency!: CurrencyCode;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  idempotencyKey!: string;
}