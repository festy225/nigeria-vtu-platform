import { IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateMarketplaceAttributeValueDto {
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
  code!: string;

  @IsString()
  @Length(1, 160)
  value!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
