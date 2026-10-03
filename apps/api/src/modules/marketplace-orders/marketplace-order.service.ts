import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';
import { MarketplacePriceResolver } from './marketplace-price-resolver.service';

export interface CreateMarketplaceOrderItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

interface ProductSnapshotRow {
  id: string;
  seller_id: string;
  product_name: string;
  product_description: string;
  seller_name: string;
  has_variants: boolean;
}

interface AttributeSnapshotRow {
  attribute_id: string;
  attribute_code: string;
  attribute_name: string;
  value_id: string;
  value_code: string;
  value: string;
}

interface ResolvedOrderItem extends ProductSnapshotRow {
  variant_id: string | null;
  sku_snapshot: string | null;
  variant_description_snapshot: AttributeSnapshotRow[];
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  currency: CurrencyCode;
}

interface MarketplaceOrderRow {
  id: string;
  order_number: string;
  status: string;
  currency: CurrencyCode;
  subtotal_minor: string | number;
  total_minor: string | number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class MarketplaceOrderService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly prices: MarketplacePriceResolver,
  ) {}

  async createDraftOrder(
    customerId: string,
    items: CreateMarketplaceOrderItem[],
  ) {
    if (!items.length) {
      throw new BadRequestException('An order requires at least one item');
    }
    for (const item of items) {
      this.validateQuantity(item.quantity);
    }

    return this.database.withTransaction(async (client) => {
      const resolvedItems: ResolvedOrderItem[] = [];
      for (const item of items) {
        resolvedItems.push(await this.resolveItem(client, item));
      }

      const currency = resolvedItems[0].currency;
      if (resolvedItems.some((item) => item.currency !== currency)) {
        throw new ConflictException(
          'Marketplace order items must use one currency',
        );
      }
      const subtotal = resolvedItems.reduce(
        (sum, item) => sum + BigInt(item.line_total_minor),
        0n,
      );
      const subtotalMinor = this.toSafeMinor(subtotal);

      const orderResult = await client.query<MarketplaceOrderRow>(
        `INSERT INTO marketplace_orders (
           customer_id, currency, subtotal_minor, total_minor
         )
         VALUES ($1, $2::currency_code, $3, $3)
         RETURNING id, order_number::text, status, currency,
                   subtotal_minor, total_minor, created_at, updated_at`,
        [customerId, currency, subtotalMinor],
      );
      const order = orderResult.rows[0];

      for (const item of resolvedItems) {
        await client.query(
          `INSERT INTO marketplace_order_items (
             order_id, product_id, variant_id, seller_id, quantity,
             unit_price_minor, line_total_minor, currency,
             product_name_snapshot, product_description_snapshot,
             seller_name_snapshot, sku_snapshot,
             variant_description_snapshot
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8::currency_code,
             $9, $10, $11, $12, $13::jsonb
           )`,
          [
            order.id,
            item.id,
            item.variant_id,
            item.seller_id,
            item.quantity,
            item.unit_price_minor,
            item.line_total_minor,
            item.currency,
            item.product_name,
            item.product_description,
            item.seller_name,
            item.sku_snapshot,
            JSON.stringify(item.variant_description_snapshot),
          ],
        );
      }

      await this.audit.record(
        {
          actorId: customerId,
          action: 'MARKETPLACE_ORDER_DRAFT_CREATED',
          resourceType: 'MARKETPLACE_ORDER',
          resourceId: order.id,
          afterData: {
            orderNumber: order.order_number,
            status: order.status,
            itemCount: resolvedItems.length,
            subtotalMinor: subtotalMinor.toString(),
            currency,
          },
        },
        client,
      );

      return {
        id: order.id,
        orderNumber: order.order_number,
        customerId,
        status: order.status,
        currency: order.currency,
        subtotalMinor: this.toSafeMinor(order.subtotal_minor),
        totalMinor: this.toSafeMinor(order.total_minor),
        items: resolvedItems.map((item) => ({
          productId: item.id,
          variantId: item.variant_id,
          sellerId: item.seller_id,
          sellerName: item.seller_name,
          quantity: item.quantity,
          unitPriceMinor: item.unit_price_minor,
          lineTotalMinor: item.line_total_minor,
          currency: item.currency,
          productName: item.product_name,
          productDescription: item.product_description,
          sku: item.sku_snapshot,
          variantDescription: item.variant_description_snapshot,
        })),
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      };
    });
  }

  private async resolveItem(
    client: PoolClient,
    item: CreateMarketplaceOrderItem,
  ): Promise<ResolvedOrderItem> {
    const productResult = await client.query<ProductSnapshotRow>(
      `SELECT product.id,
              product.seller_id,
              product.name AS product_name,
              product.description AS product_description,
              seller.store_name AS seller_name,
              EXISTS (
                SELECT 1
                FROM marketplace_product_variants variant
                WHERE variant.product_id = product.id
              ) AS has_variants
       FROM marketplace_products product
       JOIN marketplace_sellers seller ON seller.id = product.seller_id
       WHERE product.id = $1
       FOR SHARE OF product, seller`,
      [item.productId],
    );
    const product = productResult.rows[0];
    if (!product) {
      throw new NotFoundException('Marketplace product not found');
    }

    if (!item.variantId) {
      const price = await this.prices.resolveSimpleProduct(
        client,
        product.id,
        product.seller_id,
      );
      const lineTotal = this.toSafeMinor(
        BigInt(price.priceMinor) * BigInt(item.quantity),
      );
      return {
        ...product,
        variant_id: null,
        sku_snapshot: null,
        variant_description_snapshot: [],
        quantity: item.quantity,
        unit_price_minor: price.priceMinor,
        line_total_minor: lineTotal,
        currency: price.currency,
      };
    }

    if (!product.has_variants) {
      throw new BadRequestException(
        'A simple product cannot have a selected variant',
      );
    }

    const variant = await this.prices.resolveVariantProduct(
      client,
      product.id,
      item.variantId,
      product.seller_id,
    );
    const attributeResult = await client.query<AttributeSnapshotRow>(
      `SELECT selected.attribute_id,
              attribute.code AS attribute_code,
              attribute.name AS attribute_name,
              selected.attribute_value_id AS value_id,
              attribute_value.code AS value_code,
              attribute_value.value
       FROM marketplace_product_variant_attribute_values selected
       JOIN marketplace_product_attributes attribute
         ON attribute.id = selected.attribute_id
       JOIN marketplace_product_attribute_values attribute_value
         ON attribute_value.id = selected.attribute_value_id
        AND attribute_value.attribute_id = selected.attribute_id
       WHERE selected.product_id = $1 AND selected.variant_id = $2
       ORDER BY attribute.sort_order, attribute.id`,
      [product.id, variant.id],
    );
    const unitPriceMinor = variant.priceMinor;
    const lineTotal = this.toSafeMinor(
      BigInt(unitPriceMinor) * BigInt(item.quantity),
    );
    return {
      ...product,
      variant_id: variant.id,
      sku_snapshot: variant.sku,
      variant_description_snapshot: attributeResult.rows,
      quantity: item.quantity,
      unit_price_minor: unitPriceMinor,
      line_total_minor: lineTotal,
      currency: variant.currency,
    };
  }

  private validateQuantity(quantity: number): void {
    if (
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      quantity > 2147483647
    ) {
      throw new BadRequestException(
        'Order item quantity must be a positive PostgreSQL integer',
      );
    }
  }

  private toSafeMinor(value: string | number | bigint): number {
    const amount = BigInt(value);
    if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestException(
        'Order amount is outside the supported integer range',
      );
    }
    return Number(amount);
  }

}
