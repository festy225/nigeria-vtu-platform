import { IsUUID } from 'class-validator';

export class CheckoutMarketplaceCartDto {
  @IsUUID()
  customerAddressId!: string;
}
