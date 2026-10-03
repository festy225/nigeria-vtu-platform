import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateMarketplaceAttributeValueDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  value?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
