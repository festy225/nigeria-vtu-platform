import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  IsEmail,
  IsArray,
  ArrayMaxSize,
  ArrayNotEmpty,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';

export class CreateSellerApplicationDto {
  @IsOptional()
  @IsIn(['RETAILER'])
  sellerType?: 'RETAILER';

  @IsOptional()
  @IsString()
  @Length(2, 200)
  businessName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  storeName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 220)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  storeSlug?: string;

  @IsOptional()
  @IsString()
  @Length(20, 3000)
  businessDescription?: string;

  @IsOptional()
  @IsIn(['REGISTERED', 'UNREGISTERED', 'IN_PROGRESS'])
  businessRegistrationStatus?: 'REGISTERED' | 'UNREGISTERED' | 'IN_PROGRESS';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cacRegistrationNumber?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  businessEmail?: string;

  @IsOptional()
  @IsString()
  @Length(7, 40)
  businessPhone?: string;

  @IsOptional()
  @IsString()
  @Length(10, 1000)
  businessAddress?: string;

  @IsOptional()
  @IsString()
  @Length(20, 3000)
  productsServicesDescription?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  productCategories?: string[];
}

export class ReviewSellerApplicationDto {
  @IsIn(['START_REVIEW', 'APPROVE', 'REJECT', 'MORE_INFORMATION_REQUIRED'])
  decision!:
    | 'START_REVIEW'
    | 'APPROVE'
    | 'REJECT'
    | 'MORE_INFORMATION_REQUIRED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNote?: string;
}
