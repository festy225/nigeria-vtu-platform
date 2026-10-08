import { IsUUID } from 'class-validator';

export class CreateSellerFulfillmentDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  customerAddressId!: string;

  @IsUUID()
  sellerLocationId!: string;
}
