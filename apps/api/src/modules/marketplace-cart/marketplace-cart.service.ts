import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import {
  MarketplacePriceResolver,
  type MarketplaceResolvedPrice,
  type MarketplaceResolvedVariantPrice,
} from '../marketplace-orders/marketplace-price-resolver.service';
import { MarketplaceOrderService } from '../marketplace-orders/marketplace-order.service';
import type { AddMarketplaceCartItemDto } from './dto/add-marketplace-cart-item.dto';

interface CartRow {
  id: string;
  pending_order_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CartItemRow {
  id: string;
  product_id: string;
  seller_id: string;
  product_name: string;
  variant_id: string | null;
  quantity: number;
  created_at: Date;
  updated_at: Date;
}

interface CartVariantAttributeRow {
  attribute_id: string;
  attribute_code: string;
  attribute_name: string;
  value_id: string;
  value_code: string;
  value: string;
}

interface CartItemResult extends CartItemRow {
  price: MarketplaceResolvedPrice | MarketplaceResolvedVariantPrice;
  attributes: CartVariantAttributeRow[];
}

interface CheckoutCartItemRow {
  productId: string;
  variantId: string | null;
  quantity: number;
}

@Injectable()
export class MarketplaceCartService {
  constructor(
    private readonly database: DatabaseService,
    private readonly prices: MarketplacePriceResolver,
    private readonly orders: MarketplaceOrderService,
  ) {}

  async getCart(userId: string) {
    return this.database.withTransaction((client) =>
      this.getCartInTransaction(client, userId),
    );
  }

  async addItem(userId: string, dto: AddMarketplaceCartItemDto) {
    this.validateQuantity(dto.quantity);

    return this.database.withTransaction(async (client) => {
      const cartResult = await client.query<CartRow>(
        `INSERT INTO marketplace_carts (user_id)
         VALUES ($1)
         ON CONFLICT (user_id)
         DO UPDATE SET updated_at = marketplace_carts.updated_at
         RETURNING id, pending_order_id, created_at, updated_at`,
        [userId],
      );
      const cart = cartResult.rows[0];
      this.assertCartEditable(cart);
      const sellerId = await this.getProductSeller(
        client,
        dto.productId,
      );
      await this.resolvePrice(
        client,
        dto.productId,
        sellerId,
        dto.variantId,
      );

      const currentResult = await client.query<{ id: string; quantity: number }>(
        `SELECT id, quantity
         FROM marketplace_cart_items
         WHERE cart_id = $1
           AND product_id = $2
           AND variant_id IS NOT DISTINCT FROM $3::uuid
         FOR UPDATE`,
        [cart.id, dto.productId, dto.variantId ?? null],
      );
      const current = currentResult.rows[0];
      if (current) {
        const quantity = current.quantity + dto.quantity;
        this.validateQuantity(quantity);
        await client.query(
          `UPDATE marketplace_cart_items
           SET quantity = $1, updated_at = now()
           WHERE id = $2 AND cart_id = $3`,
          [quantity, current.id, cart.id],
        );
      } else {
        await client.query(
          `INSERT INTO marketplace_cart_items (
             cart_id, product_id, variant_id, quantity
           )
           VALUES ($1, $2, $3, $4)`,
          [cart.id, dto.productId, dto.variantId ?? null, dto.quantity],
        );
      }

      await client.query(
        'UPDATE marketplace_carts SET updated_at = now() WHERE id = $1',
        [cart.id],
      );
      return this.getCartInTransaction(client, userId);
    });
  }

  async updateItemQuantity(
    userId: string,
    itemId: string,
    quantity: number,
  ) {
    this.validateQuantity(quantity);
    return this.database.withTransaction(async (client) => {
      const cartResult = await client.query<{
        id: string;
        pending_order_id: string | null;
      }>(
        `SELECT id, pending_order_id
         FROM marketplace_carts
         WHERE user_id = $1
         FOR UPDATE`,
        [userId],
      );
      const cart = cartResult.rows[0];
      if (!cart) {
        throw new NotFoundException('Marketplace cart item not found');
      }
      this.assertCartEditable(cart);
      const item = await this.getOwnedItem(client, userId, itemId, true);
      await this.resolvePrice(
        client,
        item.product_id,
        item.seller_id,
        item.variant_id ?? undefined,
      );
      await client.query(
        `UPDATE marketplace_cart_items
         SET quantity = $1, updated_at = now()
         WHERE id = $2`,
        [quantity, item.id],
      );
      await client.query(
        `UPDATE marketplace_carts
         SET updated_at = now()
         WHERE id = $1`,
        [cart.id],
      );
      return this.getCartInTransaction(client, userId);
    });
  }

  async removeItem(userId: string, itemId: string) {
    return this.database.withTransaction(async (client) => {
      const cartResult = await client.query<{
        id: string;
        pending_order_id: string | null;
      }>(
        `SELECT id, pending_order_id
         FROM marketplace_carts
         WHERE user_id = $1
         FOR UPDATE`,
        [userId],
      );
      const cart = cartResult.rows[0];
      if (!cart) {
        throw new NotFoundException('Marketplace cart item not found');
      }
      this.assertCartEditable(cart);
      const result = await client.query<{ id: string; cart_id: string }>(
        `DELETE FROM marketplace_cart_items item
         WHERE item.cart_id = $1
           AND item.id = $2
         RETURNING item.id, item.cart_id`,
        [cart.id, itemId],
      );
      const removed = result.rows[0];
      if (!removed) {
        throw new NotFoundException('Marketplace cart item not found');
      }
      await client.query(
        `UPDATE marketplace_carts
         SET updated_at = now()
         WHERE id = $1`,
        [removed.cart_id],
      );
      return { removed: true, itemId: removed.id };
    });
  }

  async clearCart(userId: string) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<{
        id: string;
        pending_order_id: string | null;
      }>(
        `SELECT id, pending_order_id
         FROM marketplace_carts
         WHERE user_id = $1
         FOR UPDATE`,
        [userId],
      );
      const cart = result.rows[0];
      if (cart) {
        this.assertCartEditable(cart);
        await client.query(
          'DELETE FROM marketplace_cart_items WHERE cart_id = $1',
          [cart.id],
        );
        await client.query(
          'UPDATE marketplace_carts SET updated_at = now() WHERE id = $1',
          [cart.id],
        );
      }
      return { cleared: true };
    });
  }

  async checkout(userId: string) {
    return this.database.withTransaction(async (client) => {
      const cartResult = await client.query<{
        id: string;
        pending_order_id: string | null;
      }>(
        `SELECT id, pending_order_id
         FROM marketplace_carts
         WHERE user_id = $1
         FOR UPDATE`,
        [userId],
      );
      const cart = cartResult.rows[0];
      if (!cart) {
        throw new BadRequestException('Cannot checkout an empty cart');
      }
      if (cart.pending_order_id) {
        const order = await this.orders.getPendingPaymentOrder(
          client,
          userId,
          cart.pending_order_id,
        );
        return { ...order, payment: { status: 'NOT_INITIATED' as const } };
      }

      const itemsResult = await client.query<CheckoutCartItemRow>(
        `SELECT product_id AS "productId",
                variant_id AS "variantId",
                quantity
         FROM marketplace_cart_items
         WHERE cart_id = $1
         ORDER BY product_id, variant_id NULLS FIRST
         FOR UPDATE`,
        [cart.id],
      );
      if (!itemsResult.rows.length) {
        throw new BadRequestException('Cannot checkout an empty cart');
      }

      const order = await this.orders.createPendingPaymentOrder(
        client,
        userId,
        itemsResult.rows.map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? undefined,
          quantity: item.quantity,
        })),
      );
      const linked = await client.query<{ id: string }>(
        `UPDATE marketplace_carts
         SET pending_order_id = $1, updated_at = now()
         WHERE id = $2 AND user_id = $3 AND pending_order_id IS NULL
         RETURNING id`,
        [order.id, cart.id, userId],
      );
      if (!linked.rows[0]) {
        throw new ConflictException(
          'The cart already has a pending marketplace order',
        );
      }
      return { ...order, payment: { status: 'NOT_INITIATED' as const } };
    });
  }

  private assertCartEditable(cart: { pending_order_id?: string | null }): void {
    if (cart.pending_order_id) {
      throw new ConflictException(
        'The cart cannot be changed while an order is awaiting payment',
      );
    }
  }

  private async getCartInTransaction(client: PoolClient, userId: string) {
    const cartResult = await client.query<CartRow>(
      `SELECT id, created_at, updated_at
       FROM marketplace_carts
       WHERE user_id = $1`,
      [userId],
    );
    const cart = cartResult.rows[0];
    if (!cart) {
      return { id: null, items: [] };
    }

    const itemsResult = await client.query<CartItemRow>(
      `SELECT item.id, item.product_id, product.seller_id,
              product.name AS product_name, item.variant_id,
              item.quantity, item.created_at, item.updated_at
       FROM marketplace_cart_items item
       JOIN marketplace_products product ON product.id = item.product_id
       WHERE item.cart_id = $1
       ORDER BY item.created_at, item.id`,
      [cart.id],
    );
    const items: CartItemResult[] = [];
    for (const item of itemsResult.rows) {
      const price = await this.resolvePrice(
        client,
        item.product_id,
        item.seller_id,
        item.variant_id ?? undefined,
      );
      const attributes = item.variant_id
        ? await this.getVariantAttributes(client, item.product_id, item.variant_id)
        : [];
      items.push({ ...item, price, attributes });
    }

    return {
      id: cart.id,
      createdAt: cart.created_at,
      updatedAt: cart.updated_at,
      items: items.map((item) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product_name,
        variantId: item.variant_id,
        sku: 'sku' in item.price ? item.price.sku : null,
        variantAttributes: item.attributes.map((attribute) => ({
          attributeId: attribute.attribute_id,
          attributeCode: attribute.attribute_code,
          attributeName: attribute.attribute_name,
          valueId: attribute.value_id,
          valueCode: attribute.value_code,
          value: attribute.value,
        })),
        quantity: item.quantity,
        unitPriceMinor: item.price.priceMinor,
        lineTotalMinor: this.toSafeMinor(
          BigInt(item.price.priceMinor) * BigInt(item.quantity),
        ),
        currency: item.price.currency,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
    };
  }

  private async getProductSeller(
    client: PoolClient,
    productId: string,
  ): Promise<string> {
    const result = await client.query<{ seller_id: string }>(
      `SELECT seller_id
       FROM marketplace_products
       WHERE id = $1
       FOR SHARE`,
      [productId],
    );
    const product = result.rows[0];
    if (!product) {
      throw new NotFoundException('Marketplace product not found');
    }
    return product.seller_id;
  }

  private resolvePrice(
    client: PoolClient,
    productId: string,
    sellerId: string,
    variantId?: string,
  ) {
    return variantId
      ? this.prices.resolveVariantProduct(
          client,
          productId,
          variantId,
          sellerId,
        )
      : this.prices.resolveSimpleProduct(client, productId, sellerId);
  }

  private async getVariantAttributes(
    client: PoolClient,
    productId: string,
    variantId: string,
  ): Promise<CartVariantAttributeRow[]> {
    const result = await client.query<CartVariantAttributeRow>(
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
      [productId, variantId],
    );
    return result.rows;
  }

  private async getOwnedItem(
    client: PoolClient,
    userId: string,
    itemId: string,
    lock = false,
  ): Promise<CartItemRow> {
    const result = await client.query<CartItemRow>(
      `SELECT item.id, item.product_id, product.seller_id,
              product.name AS product_name, item.variant_id,
              item.quantity, item.created_at, item.updated_at
       FROM marketplace_cart_items item
       JOIN marketplace_carts cart ON cart.id = item.cart_id
       JOIN marketplace_products product ON product.id = item.product_id
       WHERE cart.user_id = $1 AND item.id = $2
       ${lock ? 'FOR UPDATE OF item' : ''}`,
      [userId, itemId],
    );
    const item = result.rows[0];
    if (!item) {
      throw new NotFoundException('Marketplace cart item not found');
    }
    return item;
  }

  private validateQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647) {
      throw new BadRequestException(
        'Cart quantity must be a positive PostgreSQL integer',
      );
    }
  }

  private toSafeMinor(value: bigint): number {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestException(
        'Cart line total is outside the supported integer range',
      );
    }
    return Number(value);
  }
}
