import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { MarketplaceInventoryService } from '../src/modules/sellers/marketplace-inventory.service';
import { SetMarketplaceInventoryDto } from '../src/modules/sellers/dto/set-marketplace-inventory.dto';

type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;

describe('MarketplaceInventoryService', () => {
  const client = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
  };
  const database = {
    withTransaction: jest.fn((work: (value: typeof client) => unknown) =>
      work(client),
    ),
  };
  const audit = { record: jest.fn() };
  const service = new MarketplaceInventoryService(
    database as never,
    audit as never,
  );
  const productId = 'product-id';
  const variantId = 'variant-id';
  const inventory = {
    id: 'inventory-id',
    product_id: productId,
    variant_id: null,
    on_hand_quantity: 12,
    reserved_quantity: 0,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
  };
  const ownedProduct = { id: productId };

  beforeEach(() => {
    jest.clearAllMocks();
    database.withTransaction.mockImplementation(
      (work: (value: typeof client) => unknown) => work(client),
    );
    client.query.mockResolvedValue({ rows: [], rowCount: 0 });
    audit.record.mockResolvedValue(undefined);
  });

  it('sets and retrieves inventory for a simple seller-owned product', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [ownedProduct] })
      .mockResolvedValueOnce({ rows: [{ has_variants: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...inventory, on_hand_quantity: 8 }] });

    const result = await service.setProductInventory(
      'user-id',
      productId,
      8,
    );

    expect(result).toMatchObject({
      productId,
      variantId: null,
      onHandQuantity: 8,
      reservedQuantity: 0,
    });
    expect(database.withTransaction).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0]?.[1]).toEqual(['user-id', productId]);
    expect(client.query.mock.calls[0]?.[0]).toContain('FOR UPDATE OF product');
    expect(client.query.mock.calls[3]?.[0]).toContain(
      'INSERT INTO marketplace_product_inventory',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-id',
        action: 'MARKETPLACE_INVENTORY_SET',
        resourceId: inventory.id,
        beforeData: null,
        afterData: {
          productId,
          variantId: null,
          onHandQuantity: 8,
        },
      }),
      client,
    );

    client.query
      .mockReset()
      .mockResolvedValueOnce({ rows: [ownedProduct] })
      .mockResolvedValueOnce({ rows: [{ has_variants: false }] })
      .mockResolvedValueOnce({ rows: [{ ...inventory, on_hand_quantity: 8 }] });
    await expect(
      service.getProductInventory('user-id', productId),
    ).resolves.toMatchObject({ onHandQuantity: 8 });
    expect(client.query.mock.calls[2]?.[0]).toContain(
      'marketplace_product_inventory',
    );
  });

  it('updates simple product inventory and audits the quantity change', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [ownedProduct] })
      .mockResolvedValueOnce({ rows: [{ has_variants: false }] })
      .mockResolvedValueOnce({ rows: [{ ...inventory, on_hand_quantity: 12 }] })
      .mockResolvedValueOnce({ rows: [{ ...inventory, on_hand_quantity: 20 }] });

    await expect(
      service.setProductInventory('user-id', productId, 20),
    ).resolves.toMatchObject({ onHandQuantity: 20 });

    expect(client.query.mock.calls[2]?.[0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[3]?.[0]).toContain('UPDATE marketplace_product_inventory');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeData: {
          productId,
          variantId: null,
          onHandQuantity: 12,
        },
        afterData: {
          productId,
          variantId: null,
          onHandQuantity: 20,
        },
      }),
      client,
    );
  });

  it('accepts zero as out of stock and does not add a separate availability field', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [ownedProduct] })
      .mockResolvedValueOnce({ rows: [{ has_variants: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...inventory, on_hand_quantity: 0 }] });

    const result = await service.setProductInventory(
      'user-id',
      productId,
      0,
    );

    expect(result.onHandQuantity).toBe(0);
    expect(result).not.toHaveProperty('inStock');
  });

  it('rejects negative, fractional, and out-of-range quantities before opening a transaction', () => {
    for (const quantity of [-1, 1.5, 2147483648]) {
      expect(() =>
        service.setProductInventory('user-id', productId, quantity),
      ).toThrow(BadRequestException);
    }
    expect(database.withTransaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a product-level inventory source once variants exist', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [ownedProduct] })
      .mockResolvedValueOnce({ rows: [{ has_variants: true }] });

    await expect(
      service.setProductInventory('user-id', productId, 4),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('sets and retrieves inventory only for a variant belonging to the product', async () => {
    const variantInventory = { ...inventory, variant_id: variantId };
    client.query
      .mockResolvedValueOnce({ rows: [ownedProduct] })
      .mockResolvedValueOnce({ rows: [{ id: variantId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...variantInventory, on_hand_quantity: 5 }],
      });

    await expect(
      service.setVariantInventory('user-id', productId, variantId, 5),
    ).resolves.toMatchObject({
      productId,
      variantId,
      onHandQuantity: 5,
    });
    expect(client.query.mock.calls[1]?.[1]).toEqual([productId, variantId]);
    expect(client.query.mock.calls[1]?.[0]).toContain('FOR UPDATE');

    client.query
      .mockReset()
      .mockResolvedValueOnce({ rows: [ownedProduct] })
      .mockResolvedValueOnce({ rows: [{ id: variantId }] })
      .mockResolvedValueOnce({ rows: [variantInventory] });
    await expect(
      service.getVariantInventory('user-id', productId, variantId),
    ).resolves.toMatchObject({ variantId, onHandQuantity: 12 });
  });

  it('does not expose inventory to another seller', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.getProductInventory('other-user-id', productId),
    ).rejects.toThrow(NotFoundException);
    expect(client.query.mock.calls[0]?.[1]).toEqual([
      'other-user-id',
      productId,
    ]);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects missing or cross-product variants', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [ownedProduct] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.setVariantInventory('user-id', productId, 'other-variant', 2),
    ).rejects.toThrow(NotFoundException);
    expect(client.query.mock.calls[1]?.[1]).toEqual([
      productId,
      'other-variant',
    ]);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('allows explicitly removing simple-product inventory before adding variants', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [ownedProduct] })
      .mockResolvedValueOnce({ rows: [{ has_variants: false }] })
      .mockResolvedValueOnce({ rows: [inventory] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.deleteProductInventory('user-id', productId),
    ).resolves.toBeUndefined();
    expect(client.query.mock.calls[3]?.[0]).toContain(
      'DELETE FROM marketplace_product_inventory',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-id',
        action: 'MARKETPLACE_INVENTORY_DELETED',
        resourceId: inventory.id,
      }),
      client,
    );
  });

  it('does not delete inventory while any quantity is reserved', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [ownedProduct] })
      .mockResolvedValueOnce({ rows: [{ has_variants: false }] })
      .mockResolvedValueOnce({
        rows: [{ ...inventory, reserved_quantity: 2 }],
      });

    await expect(
      service.deleteProductInventory('user-id', productId),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not modify variant pricing or attribute relationships', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [ownedProduct] })
      .mockResolvedValueOnce({ rows: [{ id: variantId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...inventory, variant_id: variantId, on_hand_quantity: 3 }],
      });

    await service.setVariantInventory('user-id', productId, variantId, 3);

    const statements = client.query.mock.calls.map(([statement]) =>
      String(statement),
    );
    expect(statements.join('\n')).not.toMatch(
      /UPDATE\s+marketplace_product_variants|marketplace_product_variant_attribute_values/i,
    );
    expect(statements.some((statement) =>
      statement.includes('marketplace_product_inventory'),
    )).toBe(true);
  });

  it('validates the HTTP quantity DTO as a non-negative PostgreSQL integer', async () => {
    const valid = new SetMarketplaceInventoryDto();
    valid.onHandQuantity = 0;
    expect(await validate(valid)).toHaveLength(0);

    const invalid = new SetMarketplaceInventoryDto();
    invalid.onHandQuantity = -1;
    expect(await validate(invalid)).not.toHaveLength(0);

    const tooLarge = new SetMarketplaceInventoryDto();
    tooLarge.onHandQuantity = 2147483648;
    expect(await validate(tooLarge)).not.toHaveLength(0);
  });
});
