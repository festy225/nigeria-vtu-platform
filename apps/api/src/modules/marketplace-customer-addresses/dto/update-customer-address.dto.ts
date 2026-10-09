import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdateCustomerAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stateProvince?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
