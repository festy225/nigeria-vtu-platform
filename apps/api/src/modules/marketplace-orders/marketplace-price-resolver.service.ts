import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';
import type { PoolClient } from 'pg';

interface ProductPricingContext {
  id: string;
  seller_id: string;
  price_minor: string | number | null;
  currency: CurrencyCode | null;
  has_variants: boolean;
  status: string;
  enabled: boolean;
}

interface VariantPricingRow {
  id: string;
  sku: string;
  price_minor: string | number;
  currency: CurrencyCode | null;
  enabled: boolean;
}

export interface MarketplaceResolvedPrice {
  priceMinor: number;
  currency: CurrencyCode;
}

export interface MarketplaceResolvedVariantPrice
  extends MarketplaceResolvedPrice {
  id: string;
  sku: string;
}

@Injectable()
export class MarketplacePriceResolver {
  async resolveSimpleProduct(
    client: PoolClient,
    productId: string,
    expectedSellerId: string,
  ): Promise<MarketplaceResolvedPrice> {
    const product = await this.getProductContext(
      client,
      productId,
      expectedSellerId,
    );
    if (product.has_variants) {
      throw new BadRequestException(
        'A variant must be selected for a variant product',
      );
    }
    if (product.price_minor === null || product.currency === null) {
      throw new ConflictException(
        'Simple marketplace product pricing is not configured',
      );
    }
    return {
      priceMinor: this.toSafeMinor(product.price_minor),
      currency: product.currency,
    };
  }

  async resolveVariantProduct(
    client: PoolClient,
    productId: string,
    variantId: string,
    expectedSellerId: string,
  ): Promise<MarketplaceResolvedVariantPrice> {
    const product = await this.getProductContext(
      client,
      productId,
      expectedSellerId,
    );
    if (!product.has_variants) {
      throw new BadRequestException(
        'A simple product cannot have a selected variant',
      );
    }

    const result = await client.query<VariantPricingRow>(
      `SELECT id, sku, price_minor, currency, enabled
       FROM marketplace_product_variants
       WHERE product_id = $1 AND id = $2
       FOR SHARE`,
      [productId, variantId],
    );
    const variant = result.rows[0];
    if (!variant) {
      throw new NotFoundException('Marketplace product variant not found');
    }
    if (!variant.enabled) {
      throw new ConflictException('Marketplace product variant is disabled');
    }
    if (variant.currency === null) {
      throw new ConflictException(
        'Marketplace product variant currency is not configured',
      );
    }

    return {
      id: variant.id,
      priceMinor: this.toSafeMinor(variant.price_minor),
      currency: variant.currency,
      sku: variant.sku,
    };
  }

  private async getProductContext(
    client: PoolClient,
    productId: string,
    expectedSellerId: string,
  ): Promise<ProductPricingContext> {
    const result = await client.query<ProductPricingContext>(
      `SELECT product.id, product.seller_id, product.status, product.enabled,
              product.price_minor, product.currency,
              EXISTS (
                SELECT 1
                FROM marketplace_product_variants variant
                WHERE variant.product_id = product.id
              ) AS has_variants
       FROM marketplace_products product
       WHERE product.id = $1 AND product.seller_id = $2
       FOR SHARE OF product`,
      [productId, expectedSellerId],
    );
    const product = result.rows[0];
    if (!product) {
      throw new NotFoundException('Marketplace product not found');
    }
    if (product.status !== 'LIVE' || !product.enabled) {
      throw new ConflictException('Marketplace product is not available');
    }
    return product;
  }

  private toSafeMinor(value: string | number): number {
    const amount = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new BadRequestException(
        'Stored marketplace price is outside the supported integer range',
      );
    }
    return amount;
  }
}
