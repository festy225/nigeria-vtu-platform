import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { validate } from 'class-validator';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import { AddMarketplaceCartItemDto } from '../src/modules/marketplace-cart/dto/add-marketplace-cart-item.dto';
import { UpdateMarketplaceCartItemDto } from '../src/modules/marketplace-cart/dto/update-marketplace-cart-item.dto';
import { MarketplaceCartController } from '../src/modules/marketplace-cart/marketplace-cart.controller';
import { MarketplaceCartService } from '../src/modules/marketplace-cart/marketplace-cart.service';
import { FeatureGuard } from '../src/common/features/feature.guard';
import { FEATURE_KEY } from '../src/common/features/feature.decorator';

type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<{
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
}>;

describe('MarketplaceCartService', () => {
  const client = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
  };
  const database = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
    withTransaction: jest.fn((work: (value: typeof client) => unknown) =>
      work(client),
    ),
  };
  const prices = {
    resolveSimpleProduct: jest.fn(),
    resolveVariantProduct: jest.fn(),
  };
  const orders = {
    createPendingPaymentOrder: jest.fn(),
    getPendingPaymentOrder: jest.fn(),
  };
  const service = new MarketplaceCartService(
    database as never,
    prices as never,
    orders as never,
  );
  const cart = {
    id: 'cart-id',
    created_at: new Date('2026-10-03T00:00:00Z'),
    updated_at: new Date('2026-10-03T00:00:00Z'),
  };
  const product = {
    id: 'product-id',
    product_id: 'product-id',
    seller_id: 'seller-id',
    product_name: 'Product',
    variant_id: null,
    quantity: 2,
    created_at: cart.created_at,
    updated_at: cart.updated_at,
  };
  const simplePrice = { priceMinor: 1250, currency: 'USD' };
  const variantPrice = {
    id: 'variant-id',
    priceMinor: 2000,
    currency: 'USD',
    sku: 'SKU-01',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client.query.mockReset();
    database.query.mockReset();
    database.withTransaction.mockImplementation(
      (work: (value: typeof client) => unknown) => work(client),
    );
    client.query.mockResolvedValue({ rows: [], rowCount: 0 });
    prices.resolveSimpleProduct.mockResolvedValue(simplePrice);
    prices.resolveVariantProduct.mockResolvedValue(variantPrice);
    orders.createPendingPaymentOrder.mockResolvedValue({
      id: 'pending-order-id',
      status: 'PENDING_PAYMENT',
      totalMinor: 2500,
      currency: 'USD',
      items: [],
    });
    orders.getPendingPaymentOrder.mockResolvedValue({
      id: 'pending-order-id',
      status: 'PENDING_PAYMENT',
      totalMinor: 2500,
      currency: 'USD',
      items: [],
    });
  });

  it('deletes items and clears the matching pending order from the owned cart', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'owned-cart-id',
          pending_order_id: 'settled-order-id',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'owned-cart-id' }] });

    await service.finalizePendingOrderCart(
      client as never,
      'authenticated-user-id',
      'settled-order-id',
    );

    expect(client.query.mock.calls[0]?.[0]).toContain(
      'WHERE user_id = $1',
    );
    expect(client.query.mock.calls[0]?.[0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[0]?.[1]).toEqual([
      'authenticated-user-id',
    ]);
    expect(client.query.mock.calls[1]?.[0]).toContain(
      'DELETE FROM marketplace_cart_items',
    );
    expect(client.query.mock.calls[1]?.[1]).toEqual(['owned-cart-id']);
    expect(client.query.mock.calls[2]?.[0]).toContain(
      'SET pending_order_id = NULL',
    );
    expect(client.query.mock.calls[2]?.[0]).toContain(
      'pending_order_id = $3',
    );
    expect(client.query.mock.calls[2]?.[1]).toEqual([
      'owned-cart-id',
      'authenticated-user-id',
      'settled-order-id',
    ]);
    expect(client.query.mock.calls).toHaveLength(3);
  });

  it('does not delete items again when finalizing an already finalized order', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 'owned-cart-id', pending_order_id: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'owned-cart-id', pending_order_id: null }],
      });

    await service.finalizePendingOrderCart(
      client as never,
      'authenticated-user-id',
      'settled-order-id',
    );
    await service.finalizePendingOrderCart(
      client as never,
      'authenticated-user-id',
      'settled-order-id',
    );

    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('rejects a cart linked to a different order without changing it', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: 'owned-cart-id',
        pending_order_id: 'different-order-id',
      }],
    });

    await expect(
      service.finalizePendingOrderCart(
        client as never,
        'authenticated-user-id',
        'settled-order-id',
      ),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('does not clear unrelated items when the owned cart has no pending order', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: 'owned-cart-id', pending_order_id: null }],
    });

    await service.finalizePendingOrderCart(
      client as never,
      'authenticated-user-id',
      'settled-order-id',
    );

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the authenticated customer has no cart', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await service.finalizePendingOrderCart(
      client as never,
      'authenticated-user-id',
      'settled-order-id',
    );

    expect(client.query.mock.calls[0]?.[1]).toEqual([
      'authenticated-user-id',
    ]);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('propagates item deletion failure without clearing the pending order link', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'owned-cart-id',
          pending_order_id: 'settled-order-id',
        }],
      })
      .mockRejectedValueOnce(new Error('cart item deletion failed'));

    await expect(
      service.finalizePendingOrderCart(
        client as never,
        'authenticated-user-id',
        'settled-order-id',
      ),
    ).rejects.toThrow('cart item deletion failed');
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('propagates cart-link clearing failure so the caller transaction can roll back deletion', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'owned-cart-id',
          pending_order_id: 'settled-order-id',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('cart link update failed'));

    await expect(
      service.finalizePendingOrderCart(
        client as never,
        'authenticated-user-id',
        'settled-order-id',
      ),
    ).rejects.toThrow('cart link update failed');
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  const mockSimpleAdd = (existingItems: Array<Record<string, unknown>> = []) => {
    client.query
      .mockResolvedValueOnce({ rows: [cart] })
      .mockResolvedValueOnce({ rows: [{ seller_id: 'seller-id' }] })
      .mockResolvedValueOnce({ rows: existingItems })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [cart] })
      .mockResolvedValueOnce({
        rows: [{
          ...product,
          quantity: existingItems.length
            ? Number(existingItems[0]?.quantity) + 3
            : 2,
        }],
      });
  };

  it('adds a simple product for the authenticated account and resolves its price server-side', async () => {
    mockSimpleAdd();

    const result = await service.addItem('authenticated-user-id', {
      productId: product.id,
      quantity: 2,
    });

    expect(result.items).toMatchObject([{
      productId: product.id,
      productName: 'Product',
      variantId: null,
      quantity: 2,
      unitPriceMinor: 1250,
      lineTotalMinor: 2500,
      currency: 'USD',
    }]);
    expect(client.query.mock.calls[0]?.[1]).toEqual(['authenticated-user-id']);
    expect(prices.resolveSimpleProduct).toHaveBeenCalledWith(
      client,
      product.id,
      'seller-id',
    );
    expect(client.query.mock.calls[3]?.[1]).toEqual([
      'cart-id',
      product.id,
      null,
      2,
    ]);
  });

  it('requires a selected matching variant for variant products', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [cart] })
      .mockResolvedValueOnce({ rows: [{ seller_id: 'seller-id' }] });
    prices.resolveSimpleProduct.mockRejectedValueOnce(
      new BadRequestException('A variant must be selected'),
    );

    await expect(
      service.addItem('user-id', {
        productId: product.id,
        quantity: 1,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(client.query).toHaveBeenCalledTimes(2);

    client.query
      .mockReset()
      .mockResolvedValueOnce({ rows: [cart] })
      .mockResolvedValueOnce({ rows: [{ seller_id: 'seller-id' }] });
    prices.resolveVariantProduct.mockRejectedValueOnce(
      new NotFoundException('Marketplace product variant not found'),
    );
    await expect(
      service.addItem('user-id', {
        productId: product.id,
        variantId: 'variant-from-another-product',
        quantity: 1,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prices.resolveVariantProduct).toHaveBeenLastCalledWith(
      client,
      product.id,
      'variant-from-another-product',
      'seller-id',
    );
  });

  it('rejects inactive products and disabled variants through the price resolver', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [cart] })
      .mockResolvedValueOnce({ rows: [{ seller_id: 'seller-id' }] });
    prices.resolveSimpleProduct.mockRejectedValueOnce(
      new ConflictException('Marketplace product is not available'),
    );
    await expect(
      service.addItem('user-id', { productId: product.id, quantity: 1 }),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(2);

    client.query
      .mockReset()
      .mockResolvedValueOnce({ rows: [cart] })
      .mockResolvedValueOnce({ rows: [{ seller_id: 'seller-id' }] });
    prices.resolveVariantProduct.mockRejectedValueOnce(
      new ConflictException('Marketplace product variant is disabled'),
    );
    await expect(
      service.addItem('user-id', {
        productId: product.id,
        variantId: 'variant-id',
        quantity: 1,
      }),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('merges duplicate simple cart lines by increasing quantity', async () => {
    mockSimpleAdd([{ id: 'line-id', quantity: 4 }]);

    const result = await service.addItem('user-id', {
      productId: product.id,
      quantity: 3,
    });

    expect(client.query.mock.calls[3]?.[0]).toContain(
      'UPDATE marketplace_cart_items',
    );
    expect(client.query.mock.calls[3]?.[1]).toEqual([7, 'line-id', 'cart-id']);
    expect(result.items[0]?.quantity).toBe(7);
  });

  it('keeps selected variant lines distinct and resolves the current variant price', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [cart] })
      .mockResolvedValueOnce({ rows: [{ seller_id: 'seller-id' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [cart] })
      .mockResolvedValueOnce({
        rows: [{ ...product, variant_id: 'variant-id', quantity: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [{
          attribute_id: 'configured-attribute',
          attribute_code: 'configured-code',
          attribute_name: 'Configured attribute',
          value_id: 'configured-value',
          value_code: 'value-code',
          value: 'Configured value',
        }],
      });

    const result = await service.addItem('user-id', {
      productId: product.id,
      variantId: 'variant-id',
      quantity: 2,
    });

    expect(prices.resolveVariantProduct).toHaveBeenCalledWith(
      client,
      product.id,
      'variant-id',
      'seller-id',
    );
    expect(client.query.mock.calls[3]?.[1]).toEqual([
      'cart-id',
      product.id,
      'variant-id',
      2,
    ]);
    expect(result.items[0]).toMatchObject({
      variantId: 'variant-id',
      sku: 'SKU-01',
      quantity: 2,
      unitPriceMinor: 2000,
      lineTotalMinor: 4000,
      variantAttributes: [{
        attributeCode: 'configured-code',
        valueCode: 'value-code',
      }],
    });
  });

  it('rejects invalid quantities and unsafe combined quantity', async () => {
    for (const quantity of [0, -1, 1.5, 2147483648]) {
      await expect(
        service.addItem('user-id', {
          productId: product.id,
          quantity,
        }),
      ).rejects.toThrow(BadRequestException);
    }
    expect(database.withTransaction).not.toHaveBeenCalled();

    client.query
      .mockResolvedValueOnce({ rows: [cart] })
      .mockResolvedValueOnce({ rows: [{ seller_id: 'seller-id' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'line-id', quantity: 2147483647 }],
      });
    await expect(
      service.addItem('user-id', {
        productId: product.id,
        quantity: 1,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(client.query.mock.calls.some(([query]) =>
      String(query).includes('UPDATE marketplace_cart_items'),
    )).toBe(false);
  });

  it('uses resolved price instead of client-supplied price and currency fields', async () => {
    mockSimpleAdd();
    const item = {
      productId: product.id,
      quantity: 2,
      priceMinor: 1,
      currency: 'GBP',
    } as never;

    const result = await service.addItem('user-id', item);

    expect(result.items[0]).toMatchObject({
      unitPriceMinor: 1250,
      currency: 'USD',
      lineTotalMinor: 2500,
    });
    expect(client.query.mock.calls.flatMap(([, values]) => values ?? [])).not.toContain(1);
    const dto = Object.assign(new AddMarketplaceCartItemDto(), {
      productId: product.id,
      quantity: 1,
      priceMinor: 1,
      currency: 'GBP',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['priceMinor', 'currency']),
    );
  });

  it('updates and removes only a cart item belonging to the authenticated account', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'cart-id' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      service.updateItemQuantity('other-user-id', 'line-id', 2),
    ).rejects.toThrow(NotFoundException);
    expect(client.query.mock.calls[1]?.[1]).toEqual([
      'other-user-id',
      'line-id',
    ]);

    client.query
      .mockReset()
      .mockResolvedValueOnce({ rows: [{ id: 'cart-id' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      service.removeItem('other-user-id', 'line-id'),
    ).rejects.toThrow(NotFoundException);
    expect(client.query.mock.calls[0]?.[1]).toEqual(['other-user-id']);
    expect(client.query.mock.calls[1]?.[1]).toEqual(['cart-id', 'line-id']);
  });

  it('returns an empty cart without creating one and can clear an owned cart', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [cart] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(service.getCart('user-id')).resolves.toEqual({
      id: null,
      items: [],
    });
    await expect(service.clearCart('user-id')).resolves.toEqual({
      cleared: true,
    });
    expect(client.query.mock.calls[0]?.[1]).toEqual(['user-id']);
    expect(client.query.mock.calls[1]?.[1]).toEqual(['user-id']);
    expect(client.query.mock.calls[2]?.[1]).toEqual(['cart-id']);
  });

  it('rejects unauthenticated requests through the global JWT guard', async () => {
    const guard = new JwtAuthGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as never,
      {} as never,
      {} as never,
    );
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('uses authenticated user context for cart controller operations', async () => {
    const carts = {
      addItem: jest.fn().mockResolvedValue({ id: 'cart-id' }),
      checkout: jest.fn().mockResolvedValue({ id: 'order-id' }),
    };
    const controller = new MarketplaceCartController(carts as never);

    await controller.checkout({ id: 'authenticated-user-id' } as never);
    await controller.addItem(
      { id: 'authenticated-user-id' } as never,
      { productId: product.id, quantity: 1 },
    );
    expect(carts.checkout).toHaveBeenCalledWith('authenticated-user-id');
    expect(carts.addItem).toHaveBeenCalledWith(
      'authenticated-user-id',
      { productId: product.id, quantity: 1 },
    );
  });

  it('rejects checkout without creating or accessing another account cart', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.checkout('authenticated-user-id')).rejects.toThrow(
      BadRequestException,
    );
    expect(client.query.mock.calls[0]?.[1]).toEqual([
      'authenticated-user-id',
    ]);
    expect(client.query.mock.calls[0]?.[0]).toContain(
      'WHERE user_id = $1',
    );
    expect(client.query.mock.calls[0]?.[0]).toContain('FOR UPDATE');
    expect(orders.createPendingPaymentOrder).not.toHaveBeenCalled();
  });

  it('rejects an empty owned cart', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'owned-cart-id', pending_order_id: null }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(service.checkout('authenticated-user-id')).rejects.toThrow(
      BadRequestException,
    );
    expect(client.query.mock.calls[1]?.[1]).toEqual(['owned-cart-id']);
    expect(orders.createPendingPaymentOrder).not.toHaveBeenCalled();
  });

  it('converts only the authenticated user cart to a backend-priced pending order', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 'owned-cart-id', pending_order_id: null }],
      })
      .mockResolvedValueOnce({
        rows: [{
          productId: product.id,
          variantId: null,
          quantity: 2,
          priceMinor: 1,
          currency: 'GBP',
          sellerId: 'untrusted-seller',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'owned-cart-id' }] });

    const result = await service.checkout('authenticated-user-id');

    expect(orders.createPendingPaymentOrder).toHaveBeenCalledWith(
      client,
      'authenticated-user-id',
      [{ productId: product.id, variantId: undefined, quantity: 2 }],
    );
    expect(result).toMatchObject({
      id: 'pending-order-id',
      status: 'PENDING_PAYMENT',
      totalMinor: 2500,
      currency: 'USD',
      payment: { status: 'NOT_INITIATED' },
    });
    expect(client.query.mock.calls[0]?.[1]).toEqual([
      'authenticated-user-id',
    ]);
    expect(client.query.mock.calls[1]?.[0]).toContain('ORDER BY product_id');
    expect(client.query.mock.calls[2]?.[1]).toEqual([
      'pending-order-id',
      'owned-cart-id',
      'authenticated-user-id',
    ]);
  });

  it('returns the existing pending order on repeated checkout without reserving again', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: 'owned-cart-id',
        pending_order_id: 'pending-order-id',
      }],
    });

    const result = await service.checkout('authenticated-user-id');

    expect(orders.getPendingPaymentOrder).toHaveBeenCalledWith(
      client,
      'authenticated-user-id',
      'pending-order-id',
    );
    expect(orders.createPendingPaymentOrder).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      id: 'pending-order-id',
      payment: { status: 'NOT_INITIATED' },
    });
  });

  it('blocks cart edits while its pending order remains unpaid', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: 'owned-cart-id',
        pending_order_id: 'pending-order-id',
      }],
    });

    await expect(
      service.clearCart('authenticated-user-id'),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('keeps checkout behind the disabled marketplace feature guard', async () => {
    const isEnabled = jest.fn().mockResolvedValue(false);
    const guard = new FeatureGuard(
      { getAllAndOverride: () => 'MARKETPLACE_ENABLED' } as never,
      { isEnabled } as never,
    );

    await expect(
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => MarketplaceCartController,
      } as never),
    ).rejects.toThrow();
    expect(isEnabled).toHaveBeenCalledWith('MARKETPLACE_ENABLED');
    expect(Reflect.getMetadata(FEATURE_KEY, MarketplaceCartController)).toBe(
      'MARKETPLACE_ENABLED',
    );
  });

  it('rejects prices whose integer line total exceeds safe integer range', async () => {
    mockSimpleAdd();
    prices.resolveSimpleProduct.mockResolvedValue({
      priceMinor: Number.MAX_SAFE_INTEGER,
      currency: 'USD',
    });

    await expect(
      service.addItem('user-id', {
        productId: product.id,
        quantity: 2,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('validates cart quantity DTO bounds', async () => {
    for (const quantity of [0, -1, 1.5, 2147483648]) {
      const dto = Object.assign(new UpdateMarketplaceCartItemDto(), {
        quantity,
      });
      expect(await validate(dto)).not.toHaveLength(0);
    }
  });
});
