import { IsUUID } from 'class-validator';

export class CreateMarketplacePaymentDto {
  @IsUUID()
  orderId!: string;
}
