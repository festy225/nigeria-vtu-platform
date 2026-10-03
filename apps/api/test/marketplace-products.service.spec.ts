import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CreateMarketplaceProductDto } from '../src/modules/sellers/dto/create-marketplace-product.dto';
import { UpdateMarketplaceProductDto } from '../src/modules/sellers/dto/update-marketplace-product.dto';
import { SellerService } from '../src/modules/sellers/seller.service';

type QueryCall = [query: string, values?: unknown[]];
type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;

describe('SellerService marketplace products', () => {
  const client = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
  };
  const database = {
    query: jest.fn<ReturnType<QueryFunction>, Parameters<QueryFunction>>(),
    withTransaction: jest.fn((work: (value: typeof client) => unknown) =>
      work(client),
    ),
  };
  const audit = { record: jest.fn() };
  const service = new SellerService(database as never, audit as never);

  beforeEach(() => {
    jest.clearAllMocks();
    client.query.mockReset();
    database.withTransaction.mockImplementation(
      (work: (value: typeof client) => unknown) => work(client),
    );
    database.query.mockResolvedValue({ rows: [], rowCount: 0 });
    client.query.mockResolvedValue({ rows: [], rowCount: 0 });
    audit.record.mockResolvedValue(undefined);
  });

  it('creates a draft product using the authenticated user seller record and a configured category', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'owned-seller-id' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'category-id' }] })
      .mockResolvedValueOnce({ rows: [{ valid: true }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'product-id',
          seller_id: 'owned-seller-id',
          category_id: 'category-id',
          name: 'Product name',
          description: 'Required product description',
          price_minor: '1500',
          currency: 'USD',
          status: 'DRAFT',
          enabled: false,
        }],
      });

    const result = await service.createProduct('authenticated-user-id', {
      categoryId: 'category-id',
      name: ' Product name ',
      description: ' Required product description ',
      priceMinor: 1500,
      currency: 'USD',
    });

    expect(result).toMatchObject({
      id: 'product-id',
      seller_id: 'owned-seller-id',
      status: 'DRAFT',
      enabled: false,
    });
    const calls = client.query.mock.calls as QueryCall[];
    expect(calls[0]?.[1]).toEqual(['authenticated-user-id']);
    expect(String(calls[3]?.[0]).split('RETURNING')[0]).not.toMatch(
      /status|enabled/i,
    );
    expect(calls[3]?.[1]).toEqual([
      'owned-seller-id',
      'category-id',
      'Product name',
      'Required product description',
      1500,
      'USD',
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MARKETPLACE_PRODUCT_CREATED',
        resourceType: 'MARKETPLACE_PRODUCT',
        resourceId: 'product-id',
        afterData: {
          sellerId: 'owned-seller-id',
          categoryId: 'category-id',
          priceMinor: '1500',
          currency: 'USD',
          status: 'DRAFT',
        },
      }),
      client,
    );
  });

  it('requires an existing seller record and an enabled database category', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'seller-id' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.createProduct('user-id', {
        categoryId: 'unknown-category',
        name: 'Product',
        description: 'Description',
        priceMinor: 1500,
        currency: 'USD',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(String(client.query.mock.calls[1]?.[0])).toContain(
      'marketplace_product_categories',
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects product creation when the configured category is disabled', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'seller-id' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.createProduct('user-id', {
        categoryId: 'disabled-category-id',
        name: 'Product',
        description: 'Description',
        priceMinor: 1500,
        currency: 'USD',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(String(client.query.mock.calls[1]?.[0])).toContain(
      'id = $1 AND enabled = true',
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('lists only products belonging to the authenticated user seller record', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'product-id' }] });

    await service.listSellerProducts('user-id');

    expect(database.query.mock.calls[0]?.[1]).toEqual(['user-id']);
    expect(database.query.mock.calls[0]?.[0]).toContain(
      'seller.user_id = $1',
    );
  });

  it('does not retrieve another seller product', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.getSellerProduct('other-user-id', 'product-id'),
    ).rejects.toThrow('Marketplace product not found');

    expect(database.query.mock.calls[0]?.[1]).toEqual([
      'other-user-id',
      'product-id',
    ]);
  });

  it('updates only editable fields for a product owned by the authenticated user', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'product-id',
          seller_id: 'seller-id',
          category_id: 'old-category',
          name: 'Old name',
          description: 'Old description',
          price_minor: '1000',
          currency: 'USD',
          status: 'DRAFT',
          has_variants: false,
          enabled: false,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ has_assignments: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 'new-category' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'product-id',
          seller_id: 'seller-id',
          category_id: 'new-category',
          name: 'New name',
          description: 'New description',
          price_minor: '1000',
          currency: 'USD',
          status: 'DRAFT',
          enabled: false,
        }],
      });

    const result = await service.updateSellerProduct('user-id', 'product-id', {
      categoryId: 'new-category',
      name: 'New name',
      description: 'New description',
    });

    expect(result.name).toBe('New name');
    expect(String(client.query.mock.calls[0]?.[0])).toContain(
      'seller.user_id = $1 AND product.id = $2',
    );
    expect(String(client.query.mock.calls[3]?.[0])).not.toMatch(
      /status\\s*=|enabled\\s*=|seller_id\\s*=/i,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MARKETPLACE_PRODUCT_UPDATED',
        resourceId: 'product-id',
      }),
      client,
    );
  });

  it('updates a simple product price for the authenticated seller and audits the change', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'product-id',
          seller_id: 'seller-id',
          category_id: 'category-id',
          name: 'Product',
          description: 'Description',
          price_minor: '1000',
          currency: 'USD',
          status: 'DRAFT',
          has_variants: false,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'product-id',
          seller_id: 'seller-id',
          category_id: 'category-id',
          name: 'Product',
          description: 'Description',
          price_minor: '2000',
          currency: 'USD',
          status: 'DRAFT',
        }],
      });

    const product = await service.updateSellerProduct('user-id', 'product-id', {
      priceMinor: 2000,
    });

    expect(product.price_minor).toBe('2000');
    expect(client.query.mock.calls[0]?.[1]).toEqual(['user-id', 'product-id']);
    expect(client.query.mock.calls[1]?.[1]).toEqual([
      'category-id',
      'Product',
      'Description',
      2000,
      'USD',
      'product-id',
      'seller-id',
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MARKETPLACE_PRODUCT_UPDATED',
        beforeData: {
          categoryId: 'category-id',
          name: 'Product',
          priceMinor: '1000',
          currency: 'USD',
          status: 'DRAFT',
        },
        afterData: {
          categoryId: 'category-id',
          name: 'Product',
          priceMinor: '2000',
          currency: 'USD',
          status: 'DRAFT',
        },
      }),
      client,
    );
  });

  it('cannot update a price on another seller product or a variant product', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      service.updateSellerProduct('other-user-id', 'product-id', {
        priceMinor: 2000,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();

    client.query.mockReset().mockResolvedValueOnce({
      rows: [{
        id: 'product-id',
        seller_id: 'seller-id',
        category_id: 'category-id',
        name: 'Product',
        description: 'Description',
        price_minor: null,
        currency: null,
        status: 'DRAFT',
        has_variants: true,
      }],
    });
    await expect(
      service.updateSellerProduct('user-id', 'product-id', {
        priceMinor: 2000,
      }),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects invalid prices and currencies unsupported by currency_code', async () => {
    for (const priceMinor of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        service.createProduct('user-id', {
          categoryId: 'category-id',
          name: 'Product',
          description: 'Description',
          priceMinor,
          currency: 'USD',
        }),
      ).rejects.toThrow(BadRequestException);
    }
    expect(database.withTransaction).not.toHaveBeenCalled();

    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'seller-id' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'category-id' }] })
      .mockResolvedValueOnce({ rows: [{ valid: false }] });
    await expect(
      service.createProduct('user-id', {
        categoryId: 'category-id',
        name: 'Product',
        description: 'Description',
        priceMinor: 100,
        currency: 'GBP' as never,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(client.query.mock.calls[2]?.[0]).toContain(
      "'currency_code'::regtype",
    );
    expect(client.query.mock.calls[2]?.[1]).toEqual(['GBP']);
  });

  it('prevents changing a product category while attribute assignments exist', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'product-id',
          seller_id: 'seller-id',
          category_id: 'old-category',
          name: 'Name',
          description: 'Description',
          price_minor: '1000',
          currency: 'USD',
          status: 'DRAFT',
          has_variants: false,
          enabled: false,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ has_assignments: true }] });

    await expect(
      service.updateSellerProduct('user-id', 'product-id', {
        categoryId: 'new-category',
      }),
    ).rejects.toThrow(ConflictException);

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not allow seller or product lifecycle fields through DTO validation', async () => {
    const createDto = Object.assign(new CreateMarketplaceProductDto(), {
      categoryId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Product',
      description: 'Description',
      priceMinor: 1500,
      currency: 'USD',
      sellerId: 'attacker-seller-id',
      status: 'LIVE',
      enabled: true,
    });
    const updateDto = Object.assign(new UpdateMarketplaceProductDto(), {
      name: 'Changed',
      sellerId: 'attacker-seller-id',
      status: 'APPROVED',
      enabled: true,
    });

    const createErrors = await validate(createDto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const updateErrors = await validate(updateDto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(createErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['sellerId', 'status', 'enabled']),
    );
    expect(updateErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['sellerId', 'status', 'enabled']),
    );
  });

  it('requires product description in create requests', async () => {
    const dto = Object.assign(new CreateMarketplaceProductDto(), {
      categoryId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Product',
      priceMinor: 1500,
      currency: 'USD',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('description');
  });

  it('adds nullable paired simple-product prices without changing variant pricing and registers the migration', () => {
    const migrationPath = resolve(
      __dirname,
      '../../../database/migrations/0030_marketplace_simple_product_pricing.sql',
    );
    const migration = readFileSync(migrationPath, 'utf8');
    const runner = readFileSync(
      resolve(__dirname, '../scripts/migrate.mjs'),
      'utf8',
    );

    expect(migration).toContain('ADD COLUMN price_minor bigint');
    expect(migration).toContain('CHECK (price_minor >= 0)');
    expect(migration).toContain('ADD COLUMN currency currency_code');
    expect(migration).toContain(
      'CHECK ((price_minor IS NULL) = (currency IS NULL))',
    );
    expect(runner).toContain("'0030_marketplace_simple_product_pricing.sql'");
  });
});
