import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';

interface OwnedProduct {
  id: string;
}

interface InventoryRow {
  id: string;
  product_id: string;
  variant_id: string | null;
  on_hand_quantity: number;
  reserved_quantity: number;
  created_at: Date;
  updated_at: Date;
}

export interface MarketplaceInventory {
  id: string;
  productId: string;
  variantId: string | null;
  onHandQuantity: number;
  reservedQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MarketplaceInventoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  getProductInventory(
    userId: string,
    productId: string,
  ): Promise<MarketplaceInventory> {
    return this.database.withTransaction(async (client) => {
      await this.requireOwnedProduct(client, userId, productId);
      await this.requireSimpleProduct(client, productId);
      return this.readInventory(client, productId, null);
    });
  }

  setProductInventory(
    userId: string,
    productId: string,
    onHandQuantity: number,
  ): Promise<MarketplaceInventory> {
    this.validateQuantity(onHandQuantity);
    return this.database.withTransaction(async (client) => {
      await this.requireOwnedProduct(client, userId, productId, true);
      await this.requireSimpleProduct(client, productId);
      return this.setInventory(
        client,
        userId,
        productId,
        null,
        onHandQuantity,
      );
    });
  }

  async deleteProductInventory(
    userId: string,
    productId: string,
  ): Promise<void> {
    await this.database.withTransaction(async (client) => {
      await this.requireOwnedProduct(client, userId, productId, true);
      await this.requireSimpleProduct(client, productId);
      const result = await client.query<InventoryRow>(
        `SELECT id, product_id, variant_id, on_hand_quantity,
                reserved_quantity, created_at, updated_at
         FROM marketplace_product_inventory
         WHERE product_id = $1 AND variant_id IS NULL
         FOR UPDATE`,
        [productId],
      );
      const inventory = result.rows[0];
      if (!inventory) {
        throw new NotFoundException('Inventory has not been configured');
      }
      if (inventory.reserved_quantity > 0) {
        throw new ConflictException(
          'Inventory with reserved quantity cannot be deleted',
        );
      }
      await client.query(
        `DELETE FROM marketplace_product_inventory WHERE id = $1`,
        [inventory.id],
      );
      await this.audit.record(
        {
          actorId: userId,
          action: 'MARKETPLACE_INVENTORY_DELETED',
          resourceType: 'MARKETPLACE_PRODUCT_INVENTORY',
          resourceId: inventory.id,
          beforeData: {
            productId,
            variantId: null,
            onHandQuantity: inventory.on_hand_quantity,
          },
          afterData: null,
        },
        client,
      );
    });
  }

  getVariantInventory(
    userId: string,
    productId: string,
    variantId: string,
  ): Promise<MarketplaceInventory> {
    return this.database.withTransaction(async (client) => {
      await this.requireOwnedProduct(client, userId, productId);
      await this.requireVariant(client, productId, variantId);
      return this.readInventory(client, productId, variantId);
    });
  }

  setVariantInventory(
    userId: string,
    productId: string,
    variantId: string,
    onHandQuantity: number,
  ): Promise<MarketplaceInventory> {
    this.validateQuantity(onHandQuantity);
    return this.database.withTransaction(async (client) => {
      await this.requireOwnedProduct(client, userId, productId, true);
      await this.requireVariant(client, productId, variantId, true);
      return this.setInventory(
        client,
        userId,
        productId,
        variantId,
        onHandQuantity,
      );
    });
  }

  private async requireOwnedProduct(
    client: PoolClient,
    userId: string,
    productId: string,
    lock = false,
  ): Promise<OwnedProduct> {
    const result = await client.query<OwnedProduct>(
      `SELECT product.id
       FROM marketplace_products product
       JOIN marketplace_sellers seller ON seller.id = product.seller_id
       WHERE seller.user_id = $1 AND product.id = $2
       ${lock ? 'FOR UPDATE OF product' : ''}`,
      [userId, productId],
    );
    const product = result.rows[0];
    if (!product) {
      throw new NotFoundException('Marketplace product not found');
    }
    return product;
  }

  private async requireSimpleProduct(
    client: PoolClient,
    productId: string,
  ): Promise<void> {
    const result = await client.query<{ has_variants: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM marketplace_product_variants
         WHERE product_id = $1
       ) AS has_variants`,
      [productId],
    );
    if (result.rows[0]?.has_variants) {
      throw new ConflictException(
        'Variant products must use variant-level inventory',
      );
    }
  }

  private async requireVariant(
    client: PoolClient,
    productId: string,
    variantId: string,
    lock = false,
  ): Promise<void> {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM marketplace_product_variants
       WHERE product_id = $1 AND id = $2
       ${lock ? 'FOR UPDATE' : ''}`,
      [productId, variantId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Marketplace product variant not found');
    }
  }

  private async readInventory(
    client: PoolClient,
    productId: string,
    variantId: string | null,
  ): Promise<MarketplaceInventory> {
    const result = await client.query<InventoryRow>(
      `SELECT id, product_id, variant_id, on_hand_quantity,
              reserved_quantity, created_at, updated_at
       FROM marketplace_product_inventory
       WHERE product_id = $1
         AND variant_id IS NOT DISTINCT FROM $2::uuid`,
      [productId, variantId],
    );
    const inventory = result.rows[0];
    if (!inventory) {
      throw new NotFoundException('Inventory has not been configured');
    }
    return this.mapInventory(inventory);
  }

  private async setInventory(
    client: PoolClient,
    userId: string,
    productId: string,
    variantId: string | null,
    onHandQuantity: number,
  ): Promise<MarketplaceInventory> {
    const existingResult = await client.query<InventoryRow>(
      `SELECT id, product_id, variant_id, on_hand_quantity,
              reserved_quantity, created_at, updated_at
       FROM marketplace_product_inventory
       WHERE product_id = $1
         AND variant_id IS NOT DISTINCT FROM $2::uuid
       FOR UPDATE`,
      [productId, variantId],
    );
    const existing = existingResult.rows[0];
    if (
      existing &&
      onHandQuantity < existing.reserved_quantity
    ) {
      throw new ConflictException(
        'On-hand quantity cannot be lower than reserved quantity',
      );
    }
    if (existing && existing.on_hand_quantity === onHandQuantity) {
      return this.mapInventory(existing);
    }

    const result = existing
      ? await client.query<InventoryRow>(
          `UPDATE marketplace_product_inventory
           SET on_hand_quantity = $1, updated_at = now()
           WHERE id = $2
           RETURNING id, product_id, variant_id, on_hand_quantity,
                     reserved_quantity, created_at, updated_at`,
          [onHandQuantity, existing.id],
        )
      : await client.query<InventoryRow>(
          `INSERT INTO marketplace_product_inventory (
             product_id, variant_id, on_hand_quantity
           )
           VALUES ($1, $2, $3)
           RETURNING id, product_id, variant_id, on_hand_quantity,
                     reserved_quantity, created_at, updated_at`,
          [productId, variantId, onHandQuantity],
        );
    const inventory = result.rows[0];
    await this.audit.record(
      {
        actorId: userId,
        action: 'MARKETPLACE_INVENTORY_SET',
        resourceType: 'MARKETPLACE_PRODUCT_INVENTORY',
        resourceId: inventory.id,
        beforeData: existing
          ? {
              productId,
              variantId,
              onHandQuantity: existing.on_hand_quantity,
            }
          : null,
        afterData: { productId, variantId, onHandQuantity },
      },
      client,
    );
    return this.mapInventory(inventory);
  }

  private validateQuantity(quantity: number): void {
    if (
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > 2147483647
    ) {
      throw new BadRequestException(
        'onHandQuantity must be a non-negative PostgreSQL integer',
      );
    }
  }

  private mapInventory(row: InventoryRow): MarketplaceInventory {
    return {
      id: row.id,
      productId: row.product_id,
      variantId: row.variant_id,
      onHandQuantity: row.on_hand_quantity,
      reservedQuantity: row.reserved_quantity,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
