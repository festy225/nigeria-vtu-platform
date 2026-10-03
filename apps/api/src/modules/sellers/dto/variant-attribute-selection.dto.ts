import { IsUUID } from 'class-validator';

export class VariantAttributeSelectionDto {
  @IsUUID()
  attributeId!: string;

  @IsUUID()
  valueId!: string;
}
