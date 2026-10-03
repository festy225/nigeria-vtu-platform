import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class SetMarketplaceInventoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  onHandQuantity!: number;
}
