import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';

export class CreateMarketplaceProductDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Length(1, 10000)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  priceMinor!: number;

  @IsString()
  currency!: CurrencyCode;
}
