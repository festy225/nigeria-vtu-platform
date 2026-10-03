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

  it('places an order awaiting payment using a locked and guarded transition', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', status: 'PENDING_PAYMENT' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'order-id' }] });

    await service.placePendingPaymentOrder(client as never, 'order-id');

    expect(client.query.mock.calls[0]?.[0]).toContain(
      'FROM marketplace_orders',
    );
    expect(client.query.mock.calls[0]?.[0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[1]?.[0]).toContain(
      "WHERE id = $2 AND status = 'PENDING_PAYMENT'",
    );
    expect(client.query.mock.calls[1]?.[1]).toEqual(['PLACED', 'order-id']);
    expect(
      client.query.mock.calls.some(([query]) =>
        String(query).includes('marketplace_order_inventory_reservations'),
      ),
    ).toBe(false);
  });

  it('treats an already placed order as an idempotent no-op', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: 'order-id', status: 'PLACED' }],
    });

    await service.placePendingPaymentOrder(client as never, 'order-id');

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it.each(['CANCELLED', 'FULFILLED'])(
    'rejects placing an order in %s state',
    async (status) => {
      client.query.mockResolvedValueOnce({
        rows: [{ id: 'order-id', status }],
      });

      await expect(
        service.placePendingPaymentOrder(client as never, 'order-id'),
      ).rejects.toThrow(ConflictException);
      expect(client.query).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects placing a missing order', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.placePendingPaymentOrder(client as never, 'missing-order-id'),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects placement if the guarded pending-state update no longer matches', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', status: 'PENDING_PAYMENT' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.placePendingPaymentOrder(client as never, 'order-id'),
    ).rejects.toThrow(ConflictException);
    expect(client.query.mock.calls[1]?.[0]).toContain(
      "status = 'PENDING_PAYMENT'",
    );
  });

  it('cancels an order awaiting payment without changing reservations', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', status: 'PENDING_PAYMENT' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'order-id' }] });

    await service.cancelPendingPaymentOrder(client as never, 'order-id');

    expect(client.query.mock.calls[0]?.[0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[1]?.[0]).toContain(
      "WHERE id = $2 AND status = 'PENDING_PAYMENT'",
    );
    expect(client.query.mock.calls[1]?.[1]).toEqual([
      'CANCELLED',
      'order-id',
    ]);
    expect(
      client.query.mock.calls.some(([query]) =>
        String(query).includes('marketplace_order_inventory_reservations'),
      ),
    ).toBe(false);
  });

  it('treats an already cancelled order as an idempotent no-op', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: 'order-id', status: 'CANCELLED' }],
    });

    await service.cancelPendingPaymentOrder(client as never, 'order-id');

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it.each(['PLACED', 'PROCESSING', 'FULFILLED'])(
    'rejects cancelling an order in %s state',
    async (status) => {
      client.query.mockResolvedValueOnce({
        rows: [{ id: 'order-id', status }],
      });

      await expect(
        service.cancelPendingPaymentOrder(client as never, 'order-id'),
      ).rejects.toThrow(ConflictException);
      expect(client.query).toHaveBeenCalledTimes(1);
    },
  );

  it('consumes a reserved inventory quantity and marks the reservation consumed', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'reservation-id',
          order_id: 'order-id',
          order_item_id: 'order-item-id',
          inventory_id: 'inventory-id',
          quantity: 3,
          status: 'RESERVED',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'inventory-id',
          on_hand_quantity: 8,
          reserved_quantity: 3,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'inventory-id' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'reservation-id' }] });

    await service.consumeInventoryReservation(
      client as never,
      'order-id',
      'order-item-id',
    );

    const calls = client.query.mock.calls;
    expect(calls[0]?.[0]).toContain('FROM marketplace_order_inventory_reservations');
    expect(calls[0]?.[0]).toContain('FOR UPDATE');
    expect(calls[1]?.[0]).toContain('FROM marketplace_product_inventory');
    expect(calls[1]?.[0]).toContain('FOR UPDATE');
    expect(calls[0]?.[1]).toEqual(['order-item-id']);
    expect(calls[1]?.[1]).toEqual(['inventory-id']);
    expect(calls[2]?.[0]).toContain(
      'on_hand_quantity = on_hand_quantity - $1',
    );
    expect(calls[2]?.[0]).toContain(
      'reserved_quantity = reserved_quantity - $1',
    );
    expect(calls[2]?.[0]).toContain('on_hand_quantity >= $1');
    expect(calls[2]?.[0]).toContain('reserved_quantity >= $1');
    expect(calls[2]?.[1]).toEqual([3, 'inventory-id']);
    expect(calls[3]?.[0]).toContain("status = 'CONSUMED'");
    expect(calls[3]?.[0]).toContain("status = 'RESERVED'");
  });

  it('does not consume inventory again when the reservation is already consumed', async () => {
    const consumedReservation = {
      id: 'reservation-id',
      order_id: 'order-id',
      order_item_id: 'order-item-id',
      inventory_id: 'inventory-id',
      quantity: 3,
      status: 'CONSUMED',
    };
    client.query
      .mockResolvedValueOnce({ rows: [consumedReservation] })
      .mockResolvedValueOnce({ rows: [consumedReservation] });

    await service.consumeInventoryReservation(
      client as never,
      'order-id',
      'order-item-id',
    );
    await expect(service.consumeInventoryReservation(
      client as never,
      'order-id',
      'order-item-id',
    )).resolves.toBeUndefined();

    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('rejects released reservations without changing inventory', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: 'reservation-id',
        order_id: 'order-id',
        order_item_id: 'order-item-id',
        inventory_id: 'inventory-id',
        quantity: 3,
        status: 'RELEASED',
      }],
    });

    await expect(
      service.consumeInventoryReservation(
        client as never,
        'order-id',
        'order-item-id',
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing reservation', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.consumeInventoryReservation(
        client as never,
        'order-id',
        'missing-order-item-id',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a reservation belonging to a different order', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: 'reservation-id',
        order_id: 'different-order-id',
        order_item_id: 'order-item-id',
        inventory_id: 'inventory-id',
        quantity: 3,
        status: 'RESERVED',
      }],
    });

    await expect(
      service.consumeInventoryReservation(
        client as never,
        'order-id',
        'order-item-id',
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects consumption when inventory quantities cannot cover the reservation', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'reservation-id',
          order_id: 'order-id',
          order_item_id: 'order-item-id',
          inventory_id: 'inventory-id',
          quantity: 3,
          status: 'RESERVED',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'inventory-id',
          on_hand_quantity: 2,
          reserved_quantity: 2,
        }],
      });

    await expect(
      service.consumeInventoryReservation(
        client as never,
        'order-id',
        'order-item-id',
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('does not mark a reservation consumed when the guarded inventory update fails', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'reservation-id',
          order_id: 'order-id',
          order_item_id: 'order-item-id',
          inventory_id: 'inventory-id',
          quantity: 3,
          status: 'RESERVED',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'inventory-id',
          on_hand_quantity: 8,
          reserved_quantity: 3,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.consumeInventoryReservation(
        client as never,
        'order-id',
        'order-item-id',
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  it('releases a reserved quantity without changing on-hand inventory', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'reservation-id',
          order_id: 'order-id',
          order_item_id: 'order-item-id',
          inventory_id: 'inventory-id',
          quantity: 3,
          status: 'RESERVED',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'inventory-id',
          on_hand_quantity: 8,
          reserved_quantity: 3,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'inventory-id' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'reservation-id' }] });

    await service.releaseInventoryReservation(
      client as never,
      'order-id',
      'order-item-id',
    );

    const calls = client.query.mock.calls;
    expect(calls[0]?.[0]).toContain(
      'FROM marketplace_order_inventory_reservations',
    );
    expect(calls[0]?.[0]).toContain('FOR UPDATE');
    expect(calls[1]?.[0]).toContain('FROM marketplace_product_inventory');
    expect(calls[1]?.[0]).toContain('FOR UPDATE');
    expect(calls[2]?.[0]).toContain(
      'reserved_quantity = reserved_quantity - $1',
    );
    expect(calls[2]?.[0]).not.toContain('on_hand_quantity =');
    expect(calls[2]?.[0]).toContain('reserved_quantity >= $1');
    expect(calls[2]?.[1]).toEqual([3, 'inventory-id']);
    expect(calls[3]?.[0]).toContain("status = 'RELEASED'");
    expect(calls[3]?.[0]).toContain("status = 'RESERVED'");
  });

  it('does not change inventory when a reservation is already released', async () => {
    const releasedReservation = {
      id: 'reservation-id',
      order_id: 'order-id',
      order_item_id: 'order-item-id',
      inventory_id: 'inventory-id',
      quantity: 3,
      status: 'RELEASED',
    };
    client.query
      .mockResolvedValueOnce({ rows: [releasedReservation] })
      .mockResolvedValueOnce({ rows: [releasedReservation] });

    await service.releaseInventoryReservation(
      client as never,
      'order-id',
      'order-item-id',
    );
    await service.releaseInventoryReservation(
      client as never,
      'order-id',
      'order-item-id',
    );

    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('rejects releasing a consumed reservation without changing inventory', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: 'reservation-id',
        order_id: 'order-id',
        order_item_id: 'order-item-id',
        inventory_id: 'inventory-id',
        quantity: 3,
        status: 'CONSUMED',
      }],
    });

    await expect(
      service.releaseInventoryReservation(
        client as never,
        'order-id',
        'order-item-id',
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects releasing a missing reservation', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.releaseInventoryReservation(
        client as never,
        'order-id',
        'missing-order-item-id',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a reservation belonging to a different order', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: 'reservation-id',
        order_id: 'different-order-id',
        order_item_id: 'order-item-id',
        inventory_id: 'inventory-id',
        quantity: 3,
        status: 'RESERVED',
      }],
    });

    await expect(
      service.releaseInventoryReservation(
        client as never,
        'order-id',
        'order-item-id',
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a reservation for a different order item', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: 'reservation-id',
        order_id: 'order-id',
        order_item_id: 'different-order-item-id',
        inventory_id: 'inventory-id',
        quantity: 3,
        status: 'RESERVED',
      }],
    });

    await expect(
      service.releaseInventoryReservation(
        client as never,
        'order-id',
        'order-item-id',
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects release when reserved inventory would become negative', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'reservation-id',
          order_id: 'order-id',
          order_item_id: 'order-item-id',
          inventory_id: 'inventory-id',
          quantity: 3,
          status: 'RESERVED',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'inventory-id',
          on_hand_quantity: 8,
          reserved_quantity: 2,
        }],
      });

    await expect(
      service.releaseInventoryReservation(
        client as never,
        'order-id',
        'order-item-id',
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('does not mark a reservation released when the guarded inventory update fails', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'reservation-id',
          order_id: 'order-id',
          order_item_id: 'order-item-id',
          inventory_id: 'inventory-id',
          quantity: 3,
          status: 'RESERVED',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'inventory-id',
          on_hand_quantity: 8,
          reserved_quantity: 3,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.releaseInventoryReservation(
        client as never,
        'order-id',
        'order-item-id',
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(3);
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

  it('locks inventory and conditionally reserves it to prevent concurrent checkout overselling', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [simplePricing] })
      .mockResolvedValueOnce({ rows: [order] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'order-item-id' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'inventory-id',
          on_hand_quantity: 10,
          reserved_quantity: 2,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'inventory-id' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.createPendingPaymentOrder(
      client as never,
      'authenticated-customer-id',
      [{ productId: product.id, quantity: 3 }],
    );

    expect(result).toMatchObject({
      customerId: 'authenticated-customer-id',
      status: 'PENDING_PAYMENT',
      currency: 'USD',
      subtotalMinor: 4500,
      totalMinor: 4500,
      items: [{
        productId: product.id,
        sellerId: 'seller-derived-from-product',
        productName: 'Current product name',
        productDescription: 'Current product description',
        quantity: 3,
        unitPriceMinor: 1500,
        lineTotalMinor: 4500,
        currency: 'USD',
      }],
    });
    expect(client.query.mock.calls[3]?.[1]).toEqual([
      'PENDING_PAYMENT',
      order.id,
    ]);
    expect(client.query.mock.calls[5]?.[0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[6]?.[0]).toContain(
      'on_hand_quantity - reserved_quantity >= $1',
    );
    expect(client.query.mock.calls[6]?.[0]).toContain('RETURNING id');
    expect(client.query.mock.calls[6]?.[1]).toEqual([3, 'inventory-id']);
    expect(client.query.mock.calls[7]?.[0]).toContain(
      'marketplace_order_inventory_reservations',
    );
    expect(client.query.mock.calls[7]?.[1]).toEqual([
      order.id,
      'order-item-id',
      'inventory-id',
      3,
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MARKETPLACE_ORDER_PENDING_PAYMENT_CREATED',
        resourceId: order.id,
      }),
      client,
    );
  });

  it('rejects missing or insufficient inventory without recording an order reservation', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [simplePricing] })
      .mockResolvedValueOnce({ rows: [order] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'order-item-id' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'inventory-id',
          on_hand_quantity: 4,
          reserved_quantity: 2,
        }],
      });

    await expect(
      service.createPendingPaymentOrder(
        client as never,
        'customer-id',
        [{ productId: product.id, quantity: 3 }],
      ),
    ).rejects.toThrow(ConflictException);

    expect(client.query).toHaveBeenCalledTimes(6);
    expect(client.query.mock.calls.some(([query]) =>
      String(query).includes('INSERT INTO marketplace_order_inventory_reservations'),
    )).toBe(false);
  });

  it('rejects checkout when inventory has not been configured', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [simplePricing] })
      .mockResolvedValueOnce({ rows: [order] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'order-item-id' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.createPendingPaymentOrder(
        client as never,
        'customer-id',
        [{ productId: product.id, quantity: 1 }],
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(6);
  });

  it('does not return a pending order to a different customer', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.getPendingPaymentOrder(
        client as never,
        'different-customer-id',
        'pending-order-id',
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query.mock.calls[0]?.[0]).toContain(
      'WHERE id = $1 AND customer_id = $2',
    );
    expect(client.query.mock.calls[0]?.[1]).toEqual([
      'pending-order-id',
      'different-customer-id',
    ]);
  });

  it('rejects a product which became disabled before checkout', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({
        rows: [{ ...simplePricing, enabled: false }],
      });

    await expect(
      service.createPendingPaymentOrder(
        client as never,
        'customer-id',
        [{ productId: product.id, quantity: 1 }],
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('rejects a product which is no longer live during checkout', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({
        rows: [{ ...simplePricing, status: 'DRAFT' }],
      });

    await expect(
      service.createPendingPaymentOrder(
        client as never,
        'customer-id',
        [{ productId: product.id, quantity: 1 }],
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('rejects missing and disabled variants during checkout', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ ...product, has_variants: true }] })
      .mockResolvedValueOnce({ rows: [variantPricing] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.createPendingPaymentOrder(
        client as never,
        'customer-id',
        [{
          productId: product.id,
          variantId: 'missing-variant',
          quantity: 1,
        }],
      ),
    ).rejects.toThrow(NotFoundException);

    client.query
      .mockReset()
      .mockResolvedValueOnce({ rows: [{ ...product, has_variants: true }] })
      .mockResolvedValueOnce({ rows: [variantPricing] })
      .mockResolvedValueOnce({
        rows: [{ ...variant, enabled: false }],
      });

    await expect(
      service.createPendingPaymentOrder(
        client as never,
        'customer-id',
        [{
          productId: product.id,
          variantId: variant.id,
          quantity: 1,
        }],
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  it('reserves variant inventory and snapshots the selected variant attributes', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ ...product, has_variants: true }],
      })
      .mockResolvedValueOnce({ rows: [variantPricing] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({ rows: attributes })
      .mockResolvedValueOnce({ rows: [order] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'variant-order-item-id' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'variant-inventory-id',
          on_hand_quantity: 6,
          reserved_quantity: 1,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'variant-inventory-id' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.createPendingPaymentOrder(
      client as never,
      'customer-id',
      [{ productId: product.id, variantId: variant.id, quantity: 2 }],
    );

    expect(result.items[0]).toMatchObject({
      variantId: variant.id,
      sku: variant.sku,
      variantDescription: attributes,
      unitPriceMinor: 1500,
      lineTotalMinor: 3000,
    });
    expect(client.query.mock.calls[7]?.[1]).toEqual([
      product.id,
      variant.id,
    ]);
    expect(client.query.mock.calls[9]?.[1]).toEqual([
      order.id,
      'variant-order-item-id',
      'variant-inventory-id',
      2,
    ]);
  });

  it('uses the pending-payment status and durable reservation linkage in the migration', () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        '../../../database/migrations/0032_marketplace_checkout_reservations.sql',
      ),
      'utf8',
    );
    expect(migration).toContain("ADD VALUE 'PENDING_PAYMENT'");
    expect(migration).toContain('pending_order_id uuid UNIQUE');
    expect(migration).toContain('marketplace_order_inventory_reservations');
    expect(migration).toContain(
      'REFERENCES marketplace_order_items(id, order_id)',
    );
    expect(migration).toContain(
      'REFERENCES marketplace_product_inventory(id)',
    );
    expect(migration).toContain("'RESERVED', 'RELEASED', 'CONSUMED'");
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
