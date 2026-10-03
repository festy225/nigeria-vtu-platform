import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class ProductAttributeSelectionDto {
  @IsUUID()
  attributeId!: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  valueIds!: string[];
}

export class ReplaceProductAttributesDto {
  @IsArray()
  @ArrayUnique((selection: ProductAttributeSelectionDto) => selection.attributeId)
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeSelectionDto)
  attributes!: ProductAttributeSelectionDto[];
}
