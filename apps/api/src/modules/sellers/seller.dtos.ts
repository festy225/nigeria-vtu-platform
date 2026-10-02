import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

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