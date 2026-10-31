import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  IsUrl,
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

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  imageUrl?: string | null;
}
