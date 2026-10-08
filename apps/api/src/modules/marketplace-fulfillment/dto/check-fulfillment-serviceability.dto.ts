import { IsUUID } from 'class-validator';

export class CheckFulfillmentServiceabilityDto {
  @IsUUID()
  orderId!: string;
}
