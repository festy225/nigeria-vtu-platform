import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';

export class UpdateMarketplaceProductDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 10000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  priceMinor?: number;

  @IsOptional()
  @IsString()
  currency?: CurrencyCode;
}
