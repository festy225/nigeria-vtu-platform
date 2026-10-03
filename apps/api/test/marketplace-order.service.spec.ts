import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MarketplaceOrderService } from '../src/modules/marketplace-orders/marketplace-order.service';
import { MarketplacePriceResolver } from '../src/modules/marketplace-orders/marketplace-price-resolver.service';

type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;

describe('MarketplaceOrderService foundation', () => {
  const client = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
  };
  const database = {
    withTransaction: jest.fn((work: (value: typeof client) => unknown) =>
      work(client),
    ),
  };
  const audit = { record: jest.fn() };
  const service = new MarketplaceOrderService(
    database as never,
    audit as never,
    new MarketplacePriceResolver(),
  );

  const product = {
    id: 'product-id',
    seller_id: 'seller-derived-from-product',
    product_name: 'Current product name',
    product_description: 'Current product description',
    seller_name: 'Current store name',
    has_variants: false,
  };
  const order = {
    id: 'order-id',
    order_number: '1000001',
    status: 'DRAFT',
    currency: 'USD',
    subtotal_minor: '4500',
    total_minor: '4500',
    created_at: new Date('2026-10-03T00:00:00Z'),
    updated_at: new Date('2026-10-03T00:00:00Z'),
  };
  const variant = {
    id: 'variant-id',
    sku: 'SKU-ORIGINAL',
    price_minor: '1500',
    currency: 'USD',
    enabled: true,
  };
  const simplePricing = {
    id: product.id,
    seller_id: product.seller_id,
    price_minor: '1500',
    currency: 'USD',
    has_variants: false,
    status: 'LIVE',
    enabled: true,
  };
  const variantPricing = {
    id: product.id,
    seller_id: product.seller_id,
    price_minor: null,
    currency: null,
    has_variants: true,
    status: 'LIVE',
    enabled: true,
  };
  const attributes = [{
    attribute_id: 'attribute-id',
    attribute_code: 'configurable-code',
    attribute_name: 'Configured attribute',
    value_id: 'value-id',
    value_code: 'configured-value',
    value: 'Configured value',
  }];

  beforeEach(() => {
    jest.clearAllMocks();
    database.withTransaction.mockImplementation(
      (work: (value: typeof client) => unknown) => work(client),
    );
    client.query.mockResolvedValue({ rows: [], rowCount: 0 });
    audit.record.mockResolvedValue(undefined);
  });

  it('creates a simple-product draft order with customer and seller derived from trusted inputs/database', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [simplePricing] })
      .mockResolvedValueOnce({ rows: [order] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.createDraftOrder('authenticated-customer-id', [
      {
        productId: product.id,
        quantity: 3,
      },
    ]);

    expect(result).toMatchObject({
      customerId: 'authenticated-customer-id',
      orderNumber: '1000001',
      status: 'DRAFT',
      subtotalMinor: 4500,
      totalMinor: 4500,
      items: [{
        productId: product.id,
        variantId: null,
        sellerId: 'seller-derived-from-product',
        quantity: 3,
        unitPriceMinor: 1500,
        lineTotalMinor: 4500,
        productName: 'Current product name',
        productDescription: 'Current product description',
        sellerName: 'Current store name',
        sku: null,
        variantDescription: [],
      }],
    });
    expect(client.query.mock.calls[0]?.[0]).toContain(
      'JOIN marketplace_sellers seller ON seller.id = product.seller_id',
    );
    expect(client.query.mock.calls[0]?.[1]).toEqual([product.id]);
    expect(client.query.mock.calls[2]?.[0]).toContain(
      'INSERT INTO marketplace_orders',
    );
    expect(client.query.mock.calls[2]?.[1]).toEqual([
      'authenticated-customer-id',
      'USD',
      4500,
    ]);
    expect(client.query.mock.calls[3]?.[1]).toEqual([
      order.id,
      product.id,
      null,
      'seller-derived-from-product',
      3,
      1500,
      4500,
      'USD',
      'Current product name',
      'Current product description',
      'Current store name',
      null,
      '[]',
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'authenticated-customer-id',
        action: 'MARKETPLACE_ORDER_DRAFT_CREATED',
        resourceId: order.id,
      }),
      client,
    );
  });

  it('creates a variant-product order item using the configured variant price and snapshots', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ ...product, has_variants: true }],
      })
      .mockResolvedValueOnce({ rows: [variantPricing] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({ rows: attributes })
      .mockResolvedValueOnce({ rows: [order] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.createDraftOrder('customer-id', [{
      productId: product.id,
      variantId: variant.id,
      quantity: 3,
    }]);

    expect(result.items[0]).toMatchObject({
      variantId: variant.id,
      sellerId: 'seller-derived-from-product',
      unitPriceMinor: 1500,
      lineTotalMinor: 4500,
      sku: 'SKU-ORIGINAL',
      variantDescription: attributes,
    });
    expect(client.query.mock.calls[2]?.[0]).toContain('FOR SHARE');
    expect(client.query.mock.calls[2]?.[1]).toEqual([
      product.id,
      variant.id,
    ]);
    expect(client.query.mock.calls[5]?.[1]).toEqual([
      order.id,
      product.id,
      variant.id,
      'seller-derived-from-product',
      3,
      1500,
      4500,
      'USD',
      'Current product name',
      'Current product description',
      'Current store name',
      'SKU-ORIGINAL',
      JSON.stringify(attributes),
    ]);
  });

  it('rejects zero, negative, fractional, and out-of-range quantities before opening a transaction', async () => {
    for (const quantity of [0, -1, 1.5, 2147483648]) {
      await expect(
        service.createDraftOrder('customer-id', [{
          productId: product.id,
          quantity,
        }]),
      ).rejects.toThrow(BadRequestException);
    }
    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('requires at least one order item', async () => {
    await expect(
      service.createDraftOrder('customer-id', []),
    ).rejects.toThrow(BadRequestException);
    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('rejects a variant product when the selected variant is omitted', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ ...product, has_variants: true }] })
      .mockResolvedValueOnce({ rows: [variantPricing] });

    await expect(
      service.createDraftOrder('customer-id', [{
        productId: product.id,
        quantity: 1,
      }]),
    ).rejects.toThrow(BadRequestException);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid variant/product combination', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ ...product, has_variants: true }] })
      .mockResolvedValueOnce({ rows: [variantPricing] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.createDraftOrder('customer-id', [{
        productId: product.id,
        variantId: 'variant-from-another-product',
        quantity: 1,
      }]),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a missing variant and a disabled variant', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ ...product, has_variants: true }],
      })
      .mockResolvedValueOnce({ rows: [variantPricing] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      service.createDraftOrder('customer-id', [{
        productId: product.id,
        variantId: 'missing-variant',
        quantity: 1,
      }]),
    ).rejects.toThrow(NotFoundException);

    client.query
      .mockReset()
      .mockResolvedValueOnce({
        rows: [{ ...product, has_variants: true }],
      })
      .mockResolvedValueOnce({ rows: [variantPricing] })
      .mockResolvedValueOnce({
        rows: [{ ...variant, enabled: false }],
      });
    await expect(
      service.createDraftOrder('customer-id', [{
        productId: product.id,
        variantId: variant.id,
        quantity: 1,
      }]),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects mixed currencies within one order', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [simplePricing] })
      .mockResolvedValueOnce({ rows: [{ ...product, id: 'product-2' }] })
      .mockResolvedValueOnce({
        rows: [{ ...simplePricing, id: 'product-2', currency: 'NGN' }],
      });

    await expect(
      service.createDraftOrder('customer-id', [
        {
          productId: product.id,
          quantity: 1,
        },
        {
          productId: 'product-2',
          quantity: 1,
        },
      ]),
    ).rejects.toThrow(ConflictException);
    expect(client.query.mock.calls.some(([query]) =>
      String(query).includes('INSERT INTO marketplace_orders'),
    )).toBe(false);
  });

  it('uses database-generated unique order numbers and stores historical snapshots', () => {
    const migration = readFileSync(
      resolve(__dirname, '../../../database/migrations/0029_marketplace_orders.sql'),
      'utf8',
    );
    expect(migration).toContain(
      "DEFAULT nextval('marketplace_order_number_seq')",
    );
    expect(migration).toContain('UNIQUE (order_number)');
    expect(migration).toContain('product_name_snapshot');
    expect(migration).toContain('product_description_snapshot');
    expect(migration).toContain('seller_name_snapshot');
    expect(migration).toContain('sku_snapshot');
    expect(migration).toContain('variant_description_snapshot');
    expect(migration).toContain('unit_price_minor');
    expect(migration).toContain('line_total_minor');
  });

  it('does not access legacy ecommerce or inventory tables', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ ...product, has_variants: true }],
      })
      .mockResolvedValueOnce({ rows: [variantPricing] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({ rows: attributes })
      .mockResolvedValueOnce({ rows: [order] })
      .mockResolvedValueOnce({ rows: [] });

    await service.createDraftOrder('customer-id', [{
      productId: product.id,
      variantId: variant.id,
      quantity: 3,
    }]);

    const statements = client.query.mock.calls.map(([query]) => String(query));
    expect(statements.join('\n')).not.toMatch(
      /ecommerce_|stock_quantity|marketplace_product_inventory|reserved_quantity|on_hand_quantity/i,
    );
  });

  it('derives seller ownership and snapshots from current database records rather than client seller data', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [simplePricing] })
      .mockResolvedValueOnce({ rows: [order] })
      .mockResolvedValueOnce({ rows: [] });

    await service.createDraftOrder('customer-id', [{
      productId: product.id,
      quantity: 3,
      priceMinor: 1,
      currency: 'NGN',
      sellerId: 'attacker-supplied-seller',
    } as never]);

    expect(client.query.mock.calls[3]?.[1]?.[3]).toBe(
      'seller-derived-from-product',
    );
    expect(client.query.mock.calls[3]?.[1]?.[5]).toBe(1500);
    expect(client.query.mock.calls[3]?.[1]?.[7]).toBe('USD');
    expect(client.query.mock.calls[3]?.[1]).toContain('Current product name');
  });
});
