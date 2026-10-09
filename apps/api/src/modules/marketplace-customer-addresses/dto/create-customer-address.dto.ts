import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateCustomerAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsString()
  @MaxLength(160)
  recipientName!: string;

  @IsString()
  @MaxLength(40)
  recipientPhone!: string;

  @IsString()
  @MaxLength(240)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine2?: string;

  @IsString()
  @MaxLength(120)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stateProvince?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  postalCode?: string;

  @IsString()
  @Length(2, 2)
  countryCode!: string;

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
