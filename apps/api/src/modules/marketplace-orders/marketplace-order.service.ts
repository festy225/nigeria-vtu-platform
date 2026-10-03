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

export interface AttributeSnapshotRow {
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

interface MarketplaceOrderItemRow {
  id: string;
}

interface InventoryReservationRow {
  id: string;
  on_hand_quantity: number;
  reserved_quantity: number;
}

interface OrderInventoryReservationRow {
  id: string;
  order_id: string;
  order_item_id: string;
  inventory_id: string;
  quantity: number;
  status: 'RESERVED' | 'RELEASED' | 'CONSUMED';
}

type MarketplaceOrderStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PLACED'
  | 'PROCESSING'
  | 'FULFILLED'
  | 'CANCELLED';

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
    this.validateItems(items);
    return this.database.withTransaction((client) =>
      this.createOrder(client, customerId, items, 'DRAFT', false),
    );
  }

  async createPendingPaymentOrder(
    client: PoolClient,
    customerId: string,
    items: CreateMarketplaceOrderItem[],
  ) {
    this.validateItems(items);
    return this.createOrder(
      client,
      customerId,
      items,
      'PENDING_PAYMENT',
      true,
    );
  }

  async getPendingPaymentOrder(
    client: PoolClient,
    customerId: string,
    orderId: string,
  ) {
    const orderResult = await client.query<MarketplaceOrderRow>(
      `SELECT id, order_number::text, status, currency,
              subtotal_minor, total_minor, created_at, updated_at
       FROM marketplace_orders
       WHERE id = $1 AND customer_id = $2
         AND status = 'PENDING_PAYMENT'`,
      [orderId, customerId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      throw new ConflictException(
        'The cart is linked to an unavailable pending order',
      );
    }
    const itemsResult = await client.query<{
      product_id: string;
      variant_id: string | null;
      seller_id: string;
      seller_name_snapshot: string;
      quantity: number;
      unit_price_minor: string | number;
      line_total_minor: string | number;
      currency: CurrencyCode;
      product_name_snapshot: string;
      product_description_snapshot: string;
      sku_snapshot: string | null;
      variant_description_snapshot: AttributeSnapshotRow[];
    }>(
      `SELECT product_id, variant_id, seller_id, seller_name_snapshot,
              quantity, unit_price_minor, line_total_minor, currency,
              product_name_snapshot, product_description_snapshot,
              sku_snapshot, variant_description_snapshot
       FROM marketplace_order_items
       WHERE order_id = $1
       ORDER BY id`,
      [order.id],
    );
    return this.toOrderResult(order, customerId, itemsResult.rows);
  }

  async consumeInventoryReservation(
    client: PoolClient,
    orderId: string,
    orderItemId: string,
  ): Promise<void> {
    const reservationResult =
      await client.query<OrderInventoryReservationRow>(
        `SELECT id, order_id, order_item_id, inventory_id, quantity, status
         FROM marketplace_order_inventory_reservations
         WHERE order_item_id = $1
         FOR UPDATE`,
        [orderItemId],
      );
    const reservation = reservationResult.rows[0];
    if (!reservation) {
      throw new NotFoundException(
        'Marketplace inventory reservation not found',
      );
    }
    if (reservation.order_id !== orderId) {
      throw new ConflictException(
        'Marketplace inventory reservation does not belong to this order',
      );
    }
    if (reservation.status === 'CONSUMED') {
      return;
    }
    if (reservation.status === 'RELEASED') {
      throw new ConflictException(
        'Released marketplace inventory cannot be consumed',
      );
    }

    const inventoryResult = await client.query<InventoryReservationRow>(
      `SELECT id, on_hand_quantity, reserved_quantity
       FROM marketplace_product_inventory
       WHERE id = $1
       FOR UPDATE`,
      [reservation.inventory_id],
    );
    const inventory = inventoryResult.rows[0];
    if (!inventory) {
      throw new NotFoundException(
        'Marketplace inventory for reservation not found',
      );
    }
    if (
      inventory.reserved_quantity < reservation.quantity ||
      inventory.on_hand_quantity < reservation.quantity
    ) {
      throw new ConflictException(
        'Marketplace inventory quantities cannot satisfy this reservation',
      );
    }

    const consumed = await client.query<{ id: string }>(
      `UPDATE marketplace_product_inventory
       SET on_hand_quantity = on_hand_quantity - $1,
           reserved_quantity = reserved_quantity - $1,
           updated_at = now()
       WHERE id = $2
         AND on_hand_quantity >= $1
         AND reserved_quantity >= $1
       RETURNING id`,
      [reservation.quantity, inventory.id],
    );
    if (!consumed.rows[0]) {
      throw new ConflictException(
        'Marketplace inventory quantities cannot satisfy this reservation',
      );
    }

    const marked = await client.query<{ id: string }>(
      `UPDATE marketplace_order_inventory_reservations
       SET status = 'CONSUMED', updated_at = now()
       WHERE id = $1 AND status = 'RESERVED'
       RETURNING id`,
      [reservation.id],
    );
    if (!marked.rows[0]) {
      throw new ConflictException(
        'Marketplace inventory reservation is no longer available',
      );
    }
  }

  private validateItems(items: CreateMarketplaceOrderItem[]): void {
    if (!items.length) {
      throw new BadRequestException('An order requires at least one item');
    }
    for (const item of items) {
      this.validateQuantity(item.quantity);
    }
  }

  private async createOrder(
    client: PoolClient,
    customerId: string,
    items: CreateMarketplaceOrderItem[],
    status: MarketplaceOrderStatus,
    reserveInventory: boolean,
  ) {
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
    if (status !== 'DRAFT') {
      const updatedOrder = await client.query<{ updated_at: Date }>(
        `UPDATE marketplace_orders
         SET status = $1::marketplace_order_status, updated_at = now()
         WHERE id = $2`,
        [status, order.id],
      );
      order.status = status;
      if (updatedOrder.rows[0]) {
        order.updated_at = updatedOrder.rows[0].updated_at;
      }
    }

    for (const item of resolvedItems) {
      const itemResult = await client.query<MarketplaceOrderItemRow>(
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
           )
         RETURNING id`,
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
      if (reserveInventory) {
        await this.reserveInventory(
          client,
          order.id,
          itemResult.rows[0].id,
          item,
        );
      }
    }

    await this.audit.record(
      {
        actorId: customerId,
        action: reserveInventory
          ? 'MARKETPLACE_ORDER_PENDING_PAYMENT_CREATED'
          : 'MARKETPLACE_ORDER_DRAFT_CREATED',
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

    return this.toOrderResult(
      order,
      customerId,
      resolvedItems.map((item) => ({
        product_id: item.id,
        variant_id: item.variant_id,
        seller_id: item.seller_id,
        seller_name_snapshot: item.seller_name,
        quantity: item.quantity,
        unit_price_minor: item.unit_price_minor,
        line_total_minor: item.line_total_minor,
        currency: item.currency,
        product_name_snapshot: item.product_name,
        product_description_snapshot: item.product_description,
        sku_snapshot: item.sku_snapshot,
        variant_description_snapshot: item.variant_description_snapshot,
      })),
    );
  }

  private async reserveInventory(
    client: PoolClient,
    orderId: string,
    orderItemId: string,
    item: ResolvedOrderItem,
  ): Promise<void> {
    const result = await client.query<InventoryReservationRow>(
      `SELECT id, on_hand_quantity, reserved_quantity
       FROM marketplace_product_inventory
       WHERE product_id = $1
         AND variant_id IS NOT DISTINCT FROM $2::uuid
       FOR UPDATE`,
      [item.id, item.variant_id],
    );
    const inventory = result.rows[0];
    if (!inventory) {
      throw new ConflictException(
        'Marketplace product inventory is not configured',
      );
    }
    if (
      inventory.on_hand_quantity - inventory.reserved_quantity <
      item.quantity
    ) {
      throw new ConflictException(
        'Insufficient marketplace inventory for this order',
      );
    }
    const updated = await client.query<{ id: string }>(
      `UPDATE marketplace_product_inventory
       SET reserved_quantity = reserved_quantity + $1, updated_at = now()
       WHERE id = $2
         AND on_hand_quantity - reserved_quantity >= $1
       RETURNING id`,
      [item.quantity, inventory.id],
    );
    if (!updated.rows[0]) {
      throw new ConflictException(
        'Insufficient marketplace inventory for this order',
      );
    }
    await client.query(
      `INSERT INTO marketplace_order_inventory_reservations (
         order_id, order_item_id, inventory_id, quantity
       )
       VALUES ($1, $2, $3, $4)`,
      [orderId, orderItemId, inventory.id, item.quantity],
    );
  }

  private toOrderResult(
    order: MarketplaceOrderRow,
    customerId: string,
    items: Array<{
      product_id: string;
      variant_id: string | null;
      seller_id: string;
      seller_name_snapshot: string;
      quantity: number;
      unit_price_minor: string | number;
      line_total_minor: string | number;
      currency: CurrencyCode;
      product_name_snapshot: string;
      product_description_snapshot: string;
      sku_snapshot: string | null;
      variant_description_snapshot: AttributeSnapshotRow[];
    }>,
  ) {
    return {
      id: order.id,
      orderNumber: order.order_number,
      customerId,
      status: order.status,
      currency: order.currency,
      subtotalMinor: this.toSafeMinor(order.subtotal_minor),
      totalMinor: this.toSafeMinor(order.total_minor),
      items: items.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id,
        sellerId: item.seller_id,
        sellerName: item.seller_name_snapshot,
        quantity: item.quantity,
        unitPriceMinor: this.toSafeMinor(item.unit_price_minor),
        lineTotalMinor: this.toSafeMinor(item.line_total_minor),
        currency: item.currency,
        productName: item.product_name_snapshot,
        productDescription: item.product_description_snapshot,
        sku: item.sku_snapshot,
        variantDescription: item.variant_description_snapshot,
      })),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
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
