import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateSellerApplicationDto {
  @IsIn(['RETAILER', 'VENDOR', 'WHOLESALER', 'DISTRIBUTOR'])
  sellerType!: 'RETAILER' | 'VENDOR' | 'WHOLESALER' | 'DISTRIBUTOR';

  @IsString()
  @Length(2, 200)
  businessName!: string;

  @IsString()
  @Length(2, 200)
  storeName!: string;

  @IsOptional()
  @IsString()
  @Length(2, 220)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  storeSlug?: string;
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
