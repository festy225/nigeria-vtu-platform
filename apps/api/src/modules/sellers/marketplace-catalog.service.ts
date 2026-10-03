import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';
import { DatabaseService } from '../../infrastructure/database/database.service';

interface MarketplaceCatalogProductRow {
  id: string;
  category_id: string;
  category_name: string;
  seller_name: string;
  name: string;
  description: string;
  price_minor: string | number | null;
  currency: CurrencyCode | null;
  has_variants: boolean;
}

interface MarketplaceCatalogVariantRow {
  id: string;
  sku: string;
  price_minor: string | number;
  currency: CurrencyCode;
  attribute_id: string | null;
  attribute_code: string | null;
  attribute_name: string | null;
  value_id: string | null;
  value_code: string | null;
  value: string | null;
}

export interface MarketplaceCatalogProduct {
  id: string;
  categoryId: string;
  categoryName: string;
  sellerName: string;
  name: string;
  description: string;
  hasVariants: boolean;
  priceMinor: number | null;
  currency: CurrencyCode | null;
}

export interface MarketplaceCatalogVariant {
  id: string;
  sku: string;
  priceMinor: number;
  currency: CurrencyCode;
  attributeValues: Array<{
    attributeId: string;
    attributeCode: string;
    attributeName: string;
    valueId: string;
    valueCode: string;
    value: string;
  }>;
}

@Injectable()
export class MarketplaceCatalogService {
  constructor(private readonly database: DatabaseService) {}

  async listProducts(): Promise<MarketplaceCatalogProduct[]> {
    const result = await this.database.query<MarketplaceCatalogProductRow>(
      `SELECT product.id, product.category_id, category.name AS category_name,
              seller.store_name AS seller_name, product.name,
              product.description, product.price_minor::text AS price_minor,
              product.currency,
              EXISTS (
                SELECT 1
                FROM marketplace_product_variants variant
                WHERE variant.product_id = product.id
              ) AS has_variants
       FROM marketplace_products product
       JOIN marketplace_product_categories category
         ON category.id = product.category_id
       JOIN marketplace_sellers seller ON seller.id = product.seller_id
       WHERE product.status = 'LIVE'
         AND product.enabled = true
         AND category.enabled = true
       ORDER BY product.created_at DESC, product.id`,
    );

    return result.rows.map((row) => this.mapProduct(row));
  }

  async getProduct(productId: string) {
    const result = await this.database.query<MarketplaceCatalogProductRow>(
      `SELECT product.id, product.category_id, category.name AS category_name,
              seller.store_name AS seller_name, product.name,
              product.description, product.price_minor::text AS price_minor,
              product.currency,
              EXISTS (
                SELECT 1
                FROM marketplace_product_variants variant
                WHERE variant.product_id = product.id
              ) AS has_variants
       FROM marketplace_products product
       JOIN marketplace_product_categories category
         ON category.id = product.category_id
       JOIN marketplace_sellers seller ON seller.id = product.seller_id
       WHERE product.id = $1
         AND product.status = 'LIVE'
         AND product.enabled = true
         AND category.enabled = true`,
      [productId],
    );
    const product = result.rows[0];
    if (!product) {
      throw new NotFoundException('Marketplace product not found');
    }

    const mappedProduct = this.mapProduct(product);
    const variants = product.has_variants
      ? await this.listAvailableVariants(productId)
      : [];
    return { ...mappedProduct, variants };
  }

  private async listAvailableVariants(
    productId: string,
  ): Promise<MarketplaceCatalogVariant[]> {
    const result = await this.database.query<MarketplaceCatalogVariantRow>(
      `SELECT variant.id, variant.sku,
              variant.price_minor::text AS price_minor, variant.currency,
              attribute.id AS attribute_id, attribute.code AS attribute_code,
              attribute.name AS attribute_name,
              attribute_value.id AS value_id,
              attribute_value.code AS value_code,
              attribute_value.value
       FROM marketplace_product_variants variant
       LEFT JOIN marketplace_product_variant_attribute_values selected
         ON selected.variant_id = variant.id
        AND selected.product_id = variant.product_id
       LEFT JOIN marketplace_product_attributes attribute
         ON attribute.id = selected.attribute_id
       LEFT JOIN marketplace_product_attribute_values attribute_value
         ON attribute_value.id = selected.attribute_value_id
        AND attribute_value.attribute_id = selected.attribute_id
       WHERE variant.product_id = $1 AND variant.enabled = true
       ORDER BY variant.created_at, variant.id,
                attribute.sort_order NULLS LAST, attribute.id`,
      [productId],
    );

    const variants = new Map<string, MarketplaceCatalogVariant>();
    for (const row of result.rows) {
      let variant = variants.get(row.id);
      if (!variant) {
        variant = {
          id: row.id,
          sku: row.sku,
          priceMinor: this.toSafeMinor(row.price_minor),
          currency: row.currency,
          attributeValues: [],
        };
        variants.set(row.id, variant);
      }
      if (
        row.attribute_id &&
        row.attribute_code &&
        row.attribute_name &&
        row.value_id &&
        row.value_code &&
        row.value
      ) {
        variant.attributeValues.push({
          attributeId: row.attribute_id,
          attributeCode: row.attribute_code,
          attributeName: row.attribute_name,
          valueId: row.value_id,
          valueCode: row.value_code,
          value: row.value,
        });
      }
    }
    return [...variants.values()];
  }

  private mapProduct(
    row: MarketplaceCatalogProductRow,
  ): MarketplaceCatalogProduct {
    return {
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      sellerName: row.seller_name,
      name: row.name,
      description: row.description,
      hasVariants: row.has_variants,
      priceMinor:
        row.price_minor === null ? null : this.toSafeMinor(row.price_minor),
      currency: row.currency,
    };
  }

  private toSafeMinor(value: string | number): number {
    const amount = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new ConflictException(
        'Marketplace product pricing is not available',
      );
    }
    return amount;
  }
}
