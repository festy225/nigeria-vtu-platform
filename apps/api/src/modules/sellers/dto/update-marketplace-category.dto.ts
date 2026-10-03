import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class UpdateMarketplaceCategoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
