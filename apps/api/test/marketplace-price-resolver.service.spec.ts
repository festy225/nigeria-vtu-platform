import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { MarketplacePriceResolver } from '../src/modules/marketplace-orders/marketplace-price-resolver.service';

type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;

describe('MarketplacePriceResolver', () => {
  const client = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
  };
  const resolver = new MarketplacePriceResolver();
  const product = {
    id: 'product-id',
    seller_id: 'seller-id',
    price_minor: '1234',
    currency: 'USD',
    has_variants: false,
    status: 'LIVE',
    enabled: true,
  };
  const variant = {
    id: 'variant-id',
    sku: 'SKU-001',
    price_minor: '2500',
    currency: 'NGN',
    enabled: true,
  };

  beforeEach(() => {
    client.query.mockReset();
    client.query.mockResolvedValue({ rows: [] });
  });

  it('resolves simple-product price and currency from the owned marketplace product', async () => {
    client.query.mockResolvedValueOnce({ rows: [product] });

    await expect(
      resolver.resolveSimpleProduct(
        client as never,
        product.id,
        product.seller_id,
      ),
    ).resolves.toEqual({ priceMinor: 1234, currency: 'USD' });
    expect(client.query.mock.calls[0]?.[1]).toEqual([
      product.id,
      product.seller_id,
    ]);
  });

  it('resolves variant price from the selected variant row', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ ...product, price_minor: null, currency: null, has_variants: true }],
      })
      .mockResolvedValueOnce({ rows: [variant] });

    await expect(
      resolver.resolveVariantProduct(
        client as never,
        product.id,
        variant.id,
        product.seller_id,
      ),
    ).resolves.toEqual({
      id: 'variant-id',
      priceMinor: 2500,
      currency: 'NGN',
      sku: 'SKU-001',
    });
    expect(client.query.mock.calls[1]?.[1]).toEqual([
      product.id,
      variant.id,
    ]);
  });

  it('rejects a missing product or an unexpected seller context', async () => {
    await expect(
      resolver.resolveSimpleProduct(
        client as never,
        product.id,
        'different-seller-id',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(client.query.mock.calls[0]?.[1]).toEqual([
      product.id,
      'different-seller-id',
    ]);
  });

  it('rejects a variant that does not belong to the requested product', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ ...product, has_variants: true }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      resolver.resolveVariantProduct(
        client as never,
        product.id,
        'variant-from-another-product',
        product.seller_id,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(client.query.mock.calls[1]?.[0]).toContain(
      'WHERE product_id = $1 AND id = $2',
    );
  });

  it('rejects simple-product resolution when variants exist', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ ...product, has_variants: true }],
    });

    await expect(
      resolver.resolveSimpleProduct(
        client as never,
        product.id,
        product.seller_id,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a simple product without an authoritative price', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ ...product, price_minor: null, currency: null }],
    });

    await expect(
      resolver.resolveSimpleProduct(
        client as never,
        product.id,
        product.seller_id,
      ),
    ).rejects.toThrow('Simple marketplace product pricing is not configured');
  });

  it('rejects a simple product without currency', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ ...product, currency: null }],
    });

    await expect(
      resolver.resolveSimpleProduct(
        client as never,
        product.id,
        product.seller_id,
      ),
    ).rejects.toThrow('Simple marketplace product pricing is not configured');
  });

  it('rejects stored prices that are not safe integer minor units', async () => {
    for (const priceMinor of ['-1', '1.25', String(Number.MAX_SAFE_INTEGER + 1)]) {
      client.query.mockReset().mockResolvedValueOnce({
        rows: [{ ...product, price_minor: priceMinor }],
      });
      await expect(
        resolver.resolveSimpleProduct(
          client as never,
          product.id,
          product.seller_id,
        ),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('rejects unavailable products and variants', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ ...product, status: 'DRAFT' }],
    });
    await expect(
      resolver.resolveSimpleProduct(
        client as never,
        product.id,
        product.seller_id,
      ),
    ).rejects.toThrow('Marketplace product is not available');

    client.query
      .mockReset()
      .mockResolvedValueOnce({
        rows: [{ ...product, price_minor: null, currency: null, has_variants: true }],
      })
      .mockResolvedValueOnce({ rows: [{ ...variant, enabled: false }] });
    await expect(
      resolver.resolveVariantProduct(
        client as never,
        product.id,
        variant.id,
        product.seller_id,
      ),
    ).rejects.toThrow('Marketplace product variant is disabled');
  });

  it('rejects a variant without currency', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ ...product, price_minor: null, currency: null, has_variants: true }],
      })
      .mockResolvedValueOnce({ rows: [{ ...variant, currency: null }] });

    await expect(
      resolver.resolveVariantProduct(
        client as never,
        product.id,
        variant.id,
        product.seller_id,
      ),
    ).rejects.toThrow('Marketplace product variant currency is not configured');
  });
});
