import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
} from 'class-validator';

export class PurchaseAirtimeDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['MTN', 'AIRTEL', 'GLO', '9MOBILE'])
  network!: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsInt()
  @Min(100)
  amountMinor!: number;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}