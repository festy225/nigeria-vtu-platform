import { ConflictException, NotFoundException } from '@nestjs/common';
import { MarketplaceCatalogService } from '../src/modules/sellers/marketplace-catalog.service';

describe('MarketplaceCatalogService', () => {
  type Query = (
    query: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
  const database = {
    query: jest.fn<ReturnType<Query>, Parameters<Query>>(),
  };
  const service = new MarketplaceCatalogService(database as never);
  const product = {
    id: 'product-id',
    category_id: 'category-id',
    category_name: 'Configured category',
    seller_name: 'Seller store',
    name: 'Configured product',
    description: 'Product description',
    price_minor: '1250',
    currency: 'NGN',
    has_variants: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only live enabled products and maps simple-product money as minor units', async () => {
    database.query.mockResolvedValueOnce({ rows: [product] });

    await expect(service.listProducts()).resolves.toEqual([
      {
        id: product.id,
        categoryId: product.category_id,
        categoryName: product.category_name,
        sellerName: product.seller_name,
        name: product.name,
        description: product.description,
        hasVariants: false,
        priceMinor: 1250,
        currency: 'NGN',
      },
    ]);
    expect(database.query.mock.calls[0]?.[0]).toContain(
      "product.status = 'LIVE'",
    );
    expect(database.query.mock.calls[0]?.[0]).toContain(
      'product.enabled = true',
    );
  });

  it('returns enabled configured variants and their server-side prices', async () => {
    database.query
      .mockResolvedValueOnce({
        rows: [{ ...product, price_minor: null, currency: null, has_variants: true }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'variant-id',
            sku: 'SKU-1',
            price_minor: '875',
            currency: 'USD',
            attribute_id: 'attribute-id',
            attribute_code: 'material',
            attribute_name: 'Material',
            value_id: 'value-id',
            value_code: 'cotton',
            value: 'Cotton',
          },
        ],
      });

    await expect(service.getProduct(product.id)).resolves.toMatchObject({
      hasVariants: true,
      priceMinor: null,
      currency: null,
      variants: [
        {
          id: 'variant-id',
          sku: 'SKU-1',
          priceMinor: 875,
          currency: 'USD',
          attributeValues: [
            {
              attributeName: 'Material',
              value: 'Cotton',
            },
          ],
        },
      ],
    });
    expect(database.query.mock.calls[1]?.[0]).toContain(
      'variant.enabled = true',
    );
  });

  it('does not expose missing products', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.getProduct('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects unsafe persisted minor-unit prices', async () => {
    database.query.mockResolvedValueOnce({
      rows: [{ ...product, price_minor: '9007199254740992' }],
    });

    await expect(service.listProducts()).rejects.toThrow(ConflictException);
  });
});
