import { IsNotEmpty, IsString } from 'class-validator';

export class SelectSellerFulfillmentOfficeDto {
  @IsString()
  @IsNotEmpty()
  providerOfficeId!: string;
}
