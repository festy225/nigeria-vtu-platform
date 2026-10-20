import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export type MarketplaceProductModerationDecision =
  | 'START_REVIEW'
  | 'APPROVE'
  | 'PUBLISH'
  | 'REJECT'
  | 'SUSPEND';

export class ReviewMarketplaceProductDto {
  @IsIn(['START_REVIEW', 'APPROVE', 'PUBLISH', 'REJECT', 'SUSPEND'])
  decision!: MarketplaceProductModerationDecision;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
