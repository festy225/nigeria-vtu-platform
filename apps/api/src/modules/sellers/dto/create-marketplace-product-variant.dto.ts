import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { VariantAttributeSelectionDto } from './variant-attribute-selection.dto';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';

export class CreateMarketplaceProductVariantDto {
  @IsString()
  @Length(1, 160)
  sku!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  priceMinor!: number;

  @IsString()
  @IsNotEmpty()
  currency!: CurrencyCode;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((selection: VariantAttributeSelectionDto) => selection.attributeId)
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeSelectionDto)
  attributeValues!: VariantAttributeSelectionDto[];
}
