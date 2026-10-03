import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { VariantAttributeSelectionDto } from './variant-attribute-selection.dto';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';

export class UpdateMarketplaceProductVariantDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  sku?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  priceMinor?: number;

  @IsOptional()
  @IsString()
  currency?: CurrencyCode;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((selection: VariantAttributeSelectionDto) => selection.attributeId)
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeSelectionDto)
  attributeValues?: VariantAttributeSelectionDto[];
}
