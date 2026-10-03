import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { MarketplaceProductVariantService } from '../src/modules/sellers/marketplace-product-variant.service';
import type { VariantAttributeSelectionDto } from '../src/modules/sellers/dto/variant-attribute-selection.dto';
import { CreateMarketplaceProductVariantDto } from '../src/modules/sellers/dto/create-marketplace-product-variant.dto';
import { VariantAttributeSelectionDto as VariantAttributeSelection } from '../src/modules/sellers/dto/variant-attribute-selection.dto';

type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;

describe('MarketplaceProductVariantService', () => {
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
  const service = new MarketplaceProductVariantService(
    database as never,
    audit as never,
  );
  const product = {
    id: 'product-id',
    seller_id: 'seller-id',
  };
  const colorId = 'attribute-color';
  const sizeId = 'attribute-size';
  const blackId = 'value-black';
  const whiteId = 'value-white';
  const size42Id = 'value-42';
  const size43Id = 'value-43';
  const black42: VariantAttributeSelectionDto[] = [
    { attributeId: colorId, valueId: blackId },
    { attributeId: sizeId, valueId: size42Id },
  ];
  const white43: VariantAttributeSelectionDto[] = [
    { attributeId: colorId, valueId: whiteId },
    { attributeId: sizeId, valueId: size43Id },
  ];
  const assignmentRows = () => [
    {
      attribute_id: colorId,
      attribute_enabled: true,
      category_enabled: true,
      attribute_value_id: blackId,
      value_enabled: true,
    },
    {
      attribute_id: colorId,
      attribute_enabled: true,
      category_enabled: true,
      attribute_value_id: whiteId,
      value_enabled: true,
    },
    {
      attribute_id: sizeId,
      attribute_enabled: true,
      category_enabled: true,
      attribute_value_id: size42Id,
      value_enabled: true,
    },
    {
      attribute_id: sizeId,
      attribute_enabled: true,
      category_enabled: true,
      attribute_value_id: size43Id,
      value_enabled: true,
    },
  ];
  const variant = {
    id: 'variant-id',
    product_id: product.id,
    sku: 'SKU-001',
    combination_key: `${colorId}:${blackId}|${sizeId}:${size42Id}`,
    enabled: true,
    price_minor: '20000',
    currency: 'NGN',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
  };
  const selectionRows = (
    selections: VariantAttributeSelectionDto[],
    variantId = variant.id,
  ) =>
    selections.map((selection) => ({
      id: variantId,
      product_id: product.id,
      ...selection,
      attribute_code: selection.attributeId === colorId ? 'color' : 'size',
      attribute_name: selection.attributeId === colorId ? 'Color' : 'Size',
      value_code:
        selection.valueId === blackId
          ? 'black'
          : selection.valueId === whiteId
            ? 'white'
            : selection.valueId === size42Id
              ? '42'
              : '43',
      value:
        selection.valueId === blackId
          ? 'Black'
          : selection.valueId === whiteId
            ? 'White'
            : selection.valueId === size42Id
              ? '42'
              : '43',
    }));

  beforeEach(() => {
    client.query.mockReset();
    database.query.mockReset();
    database.withTransaction.mockReset();
    audit.record.mockReset();
    database.withTransaction.mockImplementation(
      (work: (value: typeof client) => unknown) => work(client),
    );
    database.query.mockResolvedValue({ rows: [], rowCount: 0 });
    client.query.mockResolvedValue({ rows: [], rowCount: 0 });
    audit.record.mockResolvedValue(undefined);
  });

  it('creates an owned product variant with a valid generic attribute combination', async () => {
    const pricedVariant = { ...variant, price_minor: '2500000' };
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: assignmentRows() })
      .mockResolvedValueOnce({ rows: [{ valid: true }] })
      .mockResolvedValueOnce({ rows: [pricedVariant] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [pricedVariant] })
      .mockResolvedValueOnce({ rows: selectionRows(black42) });

    const result = await service.createVariant('user-id', product.id, {
      sku: ' SKU-001 ',
      priceMinor: 2500000,
      currency: 'NGN',
      attributeValues: black42,
    });

    expect(result).toMatchObject({
      id: variant.id,
      productId: product.id,
      sku: 'SKU-001',
      priceMinor: 2500000,
      currency: 'NGN',
      attributeValues: [
        {
          attributeId: colorId,
          attributeCode: 'color',
          valueId: blackId,
          value: 'Black',
        },
        {
          attributeId: sizeId,
          attributeCode: 'size',
          valueId: size42Id,
          value: '42',
        },
      ],
    });
    expect(client.query.mock.calls[1]?.[0]).toContain(
      'assignment_value.product_id = assignment.product_id',
    );
    expect(client.query.mock.calls[3]?.[1]).toEqual([
      product.id,
      'SKU-001',
      `${colorId}:${blackId}|${sizeId}:${size42Id}`,
      2500000,
      'NGN',
    ]);
    expect(client.query.mock.calls[4]?.[1]).toEqual([
      variant.id,
      product.id,
      colorId,
      blackId,
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-id',
        action: 'MARKETPLACE_PRODUCT_VARIANT_CREATED',
        resourceId: variant.id,
      }),
      client,
    );
  });

  it('clears and audits the simple-product price when adding the first variant', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ ...product, price_minor: '1000', currency: 'USD' }],
      })
      .mockResolvedValueOnce({ rows: assignmentRows() })
      .mockResolvedValueOnce({ rows: [{ valid: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({ rows: selectionRows(black42) });

    await service.createVariant('user-id', product.id, {
      sku: 'SKU-001',
      priceMinor: 20000,
      currency: 'NGN',
      attributeValues: black42,
    });

    expect(client.query.mock.calls[3]?.[0]).toContain(
      'SET price_minor = NULL, currency = NULL',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MARKETPLACE_PRODUCT_PRICE_CLEARED_FOR_VARIANTS',
        resourceId: product.id,
        beforeData: { priceMinor: 1000, currency: 'USD' },
        afterData: { priceMinor: null, currency: null },
      }),
      client,
    );
  });

  it('accepts another complete combination for the same product', async () => {
    const pricedVariant = {
      ...variant,
      id: 'variant-white-43',
      sku: 'SKU-002',
      price_minor: '2200000',
      currency: 'USD',
    };
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: assignmentRows() })
      .mockResolvedValueOnce({ rows: [{ valid: true }] })
      .mockResolvedValueOnce({
        rows: [pricedVariant],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [pricedVariant],
      })
      .mockResolvedValueOnce({
        rows: selectionRows(white43, 'variant-white-43'),
      });

    const result = await service.createVariant('user-id', product.id, {
      sku: 'SKU-002',
      priceMinor: 2200000,
      currency: 'USD',
      attributeValues: white43,
    });

    expect(result.attributeValues.map(({ value }) => value)).toEqual([
      'White',
      '43',
    ]);
    expect(result).toMatchObject({ priceMinor: 2200000, currency: 'USD' });
    expect(client.query.mock.calls[3]?.[1]?.[2]).toBe(
      `${colorId}:${whiteId}|${sizeId}:${size43Id}`,
    );
  });

  it('retrieves all and one variant only through the authenticated seller product', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({ rows: selectionRows(black42) });

    const list = await service.listVariants('user-id', product.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ priceMinor: 20000, currency: 'NGN' });
    expect(database.query.mock.calls[0]?.[1]).toEqual(['user-id', product.id]);

    database.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({ rows: selectionRows(black42) });
    const one = await service.getVariant('user-id', product.id, variant.id);
    expect(one).toMatchObject({
      id: variant.id,
      priceMinor: 20000,
      currency: 'NGN',
    });
    expect(database.query.mock.calls[4]?.[1]).toEqual([
      product.id,
      variant.id,
    ]);
  });

  it('updates and deletes an owned variant with audit events', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({
        rows: black42.map(({ attributeId, valueId }) => ({
          attributeId,
          valueId,
        })),
      })
      .mockResolvedValueOnce({
        rows: [{
          ...variant,
          sku: 'SKU-UPDATED',
          price_minor: '31000',
          enabled: false,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          ...variant,
          sku: 'SKU-UPDATED',
          price_minor: '31000',
          enabled: false,
        }],
      })
      .mockResolvedValueOnce({ rows: selectionRows(black42) });

    const updated = await service.updateVariant(
      'user-id',
      product.id,
      variant.id,
      { sku: ' SKU-UPDATED ', enabled: false, priceMinor: 31000 },
    );
    expect(updated.sku).toBe('SKU-UPDATED');
    expect(updated.enabled).toBe(false);
    expect(updated.priceMinor).toBe(31000);
    expect(client.query.mock.calls[3]?.[1]).toEqual([
      'SKU-UPDATED',
      variant.combination_key,
      false,
      31000,
      'NGN',
      product.id,
      variant.id,
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MARKETPLACE_PRODUCT_VARIANT_UPDATED',
        beforeData: {
          productId: product.id,
          sku: 'SKU-001',
          priceMinor: 20000,
          currency: 'NGN',
          enabled: true,
          combinationKey: variant.combination_key,
        },
        afterData: {
          productId: product.id,
          sku: 'SKU-UPDATED',
          priceMinor: 31000,
          currency: 'NGN',
          enabled: false,
          combinationKey: variant.combination_key,
        },
      }),
      client,
    );

    client.query.mockReset();
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({
        rows: black42.map(({ attributeId, valueId }) => ({
          attributeId,
          valueId,
        })),
      })
      .mockResolvedValueOnce({ rows: [] });
    await service.deleteVariant('user-id', product.id, variant.id);
    expect(client.query.mock.calls[3]?.[0]).toContain(
      'DELETE FROM marketplace_product_variants',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MARKETPLACE_PRODUCT_VARIANT_DELETED',
      }),
      client,
    );
  });

  it('rejects another seller access and variant IDs outside the product', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      service.getVariant('other-user-id', product.id, variant.id),
    ).rejects.toThrow(NotFoundException);
    expect(database.query).toHaveBeenCalledTimes(1);

    database.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      service.getVariant('user-id', product.id, 'other-product-variant'),
    ).rejects.toThrow(NotFoundException);
    expect(database.query.mock.calls[2]?.[0]).toContain(
      'WHERE product_id = $1 AND id = $2',
    );
  });

  it('rejects another seller from updating or deleting a variant', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      service.updateVariant('other-user-id', product.id, variant.id, {
        priceMinor: 1,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(client.query).toHaveBeenCalledTimes(1);

    client.query.mockReset();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      service.deleteVariant('other-user-id', product.id, variant.id),
    ).rejects.toThrow(NotFoundException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects an attribute that is not assigned to this product', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: assignmentRows() });
    await expect(
      service.createVariant('user-id', product.id, {
        sku: 'SKU-X',
        priceMinor: 1000,
        currency: 'NGN',
        attributeValues: [
          { attributeId: 'attribute-for-other-product', valueId: blackId },
          { attributeId: sizeId, valueId: size42Id },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('rejects a value that belongs to a different product assignment', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: assignmentRows() });
    await expect(
      service.createVariant('user-id', product.id, {
        sku: 'SKU-X',
        priceMinor: 1000,
        currency: 'NGN',
        attributeValues: [
          { attributeId: colorId, valueId: 'foreign-product-value' },
          { attributeId: sizeId, valueId: size42Id },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects incomplete and duplicate attribute selections', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: assignmentRows() });
    await expect(
      service.createVariant('user-id', product.id, {
        sku: 'SKU-X',
        priceMinor: 1000,
        currency: 'NGN',
        attributeValues: [{ attributeId: colorId, valueId: blackId }],
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createVariant('user-id', product.id, {
        sku: 'SKU-X',
        priceMinor: 1000,
        currency: 'NGN',
        attributeValues: [
          { attributeId: colorId, valueId: blackId },
          { attributeId: colorId, valueId: whiteId },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects disabled categories, attributes, and values for new combinations', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({
        rows: assignmentRows().map((row) => ({
          ...row,
          category_enabled: false,
        })),
      });
    await expect(
      service.createVariant('user-id', product.id, {
        sku: 'SKU-X',
        priceMinor: 1000,
        currency: 'NGN',
        attributeValues: black42,
      }),
    ).rejects.toThrow('Product category is disabled');

    client.query.mockReset();
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({
        rows: assignmentRows().map((row) => ({
          ...row,
          attribute_enabled: false,
        })),
      });
    await expect(
      service.createVariant('user-id', product.id, {
        sku: 'SKU-X',
        priceMinor: 1000,
        currency: 'NGN',
        attributeValues: black42,
      }),
    ).rejects.toThrow('A product attribute is disabled');

    client.query.mockReset();
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce(
        { rows: assignmentRows().map((row) =>
          row.attribute_value_id === blackId
            ? { ...row, value_enabled: false }
            : row,
        ) },
      );
    await expect(
      service.createVariant('user-id', product.id, {
        sku: 'SKU-X',
        priceMinor: 1000,
        currency: 'NGN',
        attributeValues: black42,
      }),
    ).rejects.toThrow(
      'Each variant selection must use a value assigned to its product attribute',
    );
  });

  it('rejects duplicate complete combinations and duplicate SKUs', async () => {
    for (const uniqueError of [
      { code: '23505', constraint: 'marketplace_product_variants_product_sku_uq' },
      { code: '23505', constraint: 'marketplace_product_variants_product_id_combination_key_key' },
    ]) {
      client.query
        .mockResolvedValueOnce({ rows: [product] })
        .mockResolvedValueOnce({ rows: assignmentRows() })
        .mockResolvedValueOnce({ rows: [{ valid: true }] })
        .mockRejectedValueOnce(uniqueError);

      await expect(
        service.createVariant('user-id', product.id, {
          sku: 'SKU-DUPLICATE',
          priceMinor: 1000,
          currency: 'NGN',
          attributeValues: [...black42].reverse(),
        }),
      ).rejects.toThrow(ConflictException);
      client.query.mockReset();
    }
  });

  it('accepts zero-priced variants and rejects negative, fractional, and unsafe prices', async () => {
    const zeroPrice = Object.assign(new CreateMarketplaceProductVariantDto(), {
      sku: 'SKU-ZERO',
      priceMinor: 0,
      currency: 'NGN',
      attributeValues: black42,
    });
    expect(
      (await validate(zeroPrice)).map((error) => error.property),
    ).not.toContain('priceMinor');

    for (const priceMinor of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        service.createVariant('user-id', product.id, {
          sku: 'SKU-X',
          priceMinor,
          currency: 'NGN',
          attributeValues: black42,
        }),
      ).rejects.toThrow(BadRequestException);
    }
    expect(database.withTransaction).not.toHaveBeenCalled();

    await expect(
      service.updateVariant('user-id', product.id, variant.id, {
        priceMinor: -1,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('rejects currency codes not present in the configured database enum', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: assignmentRows() })
      .mockResolvedValueOnce({ rows: [{ valid: false }] });

    const invalidCurrencyDto = Object.assign(
      new CreateMarketplaceProductVariantDto(),
      {
        sku: 'SKU-X',
        priceMinor: 2500,
        currency: 'XXX',
        attributeValues: black42,
      },
    );
    await expect(
      service.createVariant('user-id', product.id, invalidCurrencyDto),
    ).rejects.toThrow(BadRequestException);
    expect(client.query.mock.calls[2]?.[0]).toContain('FROM pg_enum');
  });

  it('does not permit a currency change without a replacement amount', async () => {
    await expect(
      service.updateVariant('user-id', product.id, variant.id, {
        currency: 'USD',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('updates a variant combination using only currently enabled assigned values', async () => {
    const nextCombination = white43;
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({ rows: assignmentRows() })
      .mockResolvedValueOnce({
        rows: [{ ...variant, combination_key: `${colorId}:${whiteId}|${sizeId}:${size43Id}` }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({ rows: selectionRows(nextCombination) });

    const result = await service.updateVariant(
      'user-id',
      product.id,
      variant.id,
      { attributeValues: nextCombination },
    );

    expect(result.attributeValues.map(({ value }) => value)).toEqual([
      'White',
      '43',
    ]);
    expect(client.query.mock.calls[4]?.[0]).toContain(
      'DELETE FROM marketplace_product_variant_attribute_values',
    );
  });

  it('uses product-scoped ownership and selection constraints', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: assignmentRows() })
      .mockResolvedValueOnce({ rows: [{ valid: true }] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [variant] })
      .mockResolvedValueOnce({ rows: selectionRows(black42) });
    await service.createVariant('user-id', product.id, {
      sku: 'SKU-001',
      priceMinor: 20000,
      currency: 'NGN',
      attributeValues: black42,
    });
    expect(client.query.mock.calls[0]?.[0]).toContain(
      'seller.user_id = $1 AND product.id = $2',
    );
    expect(client.query.mock.calls[4]?.[0]).toContain(
      'variant_id, product_id, attribute_id, attribute_value_id',
    );
  });

  it('rejects seller IDs and malformed variant selections in DTO validation', async () => {
    const dto = Object.assign(new CreateMarketplaceProductVariantDto(), {
      sku: 'SKU-001',
      attributeValues: [
        Object.assign(new VariantAttributeSelection(), black42[0]),
      ],
      sellerId: 'untrusted-seller',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toContain('sellerId');
  });

  it('validates prices as safe integer minor units without floats', async () => {
    const dto = Object.assign(new CreateMarketplaceProductVariantDto(), {
      sku: 'SKU-001',
      priceMinor: 12.5,
      currency: 'NGN',
      attributeValues: [
        Object.assign(new VariantAttributeSelection(), black42[0]),
      ],
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('priceMinor');

    const validDto = Object.assign(new CreateMarketplaceProductVariantDto(), {
      sku: 'SKU-001',
      priceMinor: 1200,
      currency: 'NGN',
      attributeValues: [
        Object.assign(new VariantAttributeSelection(), black42[0]),
      ],
    });
    expect(
      (await validate(validDto)).map((error) => error.property),
    ).not.toContain('priceMinor');
  });
});
