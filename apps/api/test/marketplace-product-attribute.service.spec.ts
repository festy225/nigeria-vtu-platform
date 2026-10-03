import { BadRequestException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { MarketplaceProductAttributeService } from '../src/modules/sellers/marketplace-product-attribute.service';
import { ReplaceProductAttributesDto } from '../src/modules/sellers/dto/replace-product-attributes.dto';

type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;

describe('MarketplaceProductAttributeService', () => {
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
  const service = new MarketplaceProductAttributeService(
    database as never,
    audit as never,
  );
  const product = {
    id: 'product-id',
    category_id: 'category-id',
    seller_id: 'seller-id',
  };
  const attributes = [
    { id: 'attribute-color', code: 'color', name: 'Color', enabled: true },
    { id: 'attribute-size', code: 'size', name: 'Size', enabled: true },
  ];
  const values = [
    {
      id: 'value-black',
      attribute_id: 'attribute-color',
      code: 'black',
      value: 'Black',
      enabled: true,
    },
    {
      id: 'value-white',
      attribute_id: 'attribute-color',
      code: 'white',
      value: 'White',
      enabled: true,
    },
    {
      id: 'value-42',
      attribute_id: 'attribute-size',
      code: '42',
      value: '42',
      enabled: true,
    },
  ];

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

  it('retrieves current assignments only for a product owned by the caller', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({
        rows: [
          {
            attribute_id: 'attribute-color',
            attribute_code: 'color',
            attribute_name: 'Color',
            value_id: 'value-black',
            value_code: 'black',
            value: 'Black',
          },
          {
            attribute_id: 'attribute-color',
            attribute_code: 'color',
            attribute_name: 'Color',
            value_id: 'value-white',
            value_code: 'white',
            value: 'White',
          },
        ],
      });

    const result = await service.getAssignments('user-id', product.id);

    expect(database.query.mock.calls[0]?.[1]).toEqual(['user-id', product.id]);
    expect(result).toEqual([
      {
        attributeId: 'attribute-color',
        code: 'color',
        name: 'Color',
        values: [
          { id: 'value-black', code: 'black', value: 'Black' },
          { id: 'value-white', code: 'white', value: 'White' },
        ],
      },
    ]);
  });

  it('assigns multiple configured attributes and multiple values to an owned product', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [{ id: product.category_id }] })
      .mockResolvedValueOnce({ rows: attributes })
      .mockResolvedValueOnce({ rows: values })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            attribute_id: 'attribute-color',
            attribute_code: 'color',
            attribute_name: 'Color',
            value_id: 'value-black',
            value_code: 'black',
            value: 'Black',
          },
          {
            attribute_id: 'attribute-color',
            attribute_code: 'color',
            attribute_name: 'Color',
            value_id: 'value-white',
            value_code: 'white',
            value: 'White',
          },
          {
            attribute_id: 'attribute-size',
            attribute_code: 'size',
            attribute_name: 'Size',
            value_id: 'value-42',
            value_code: '42',
            value: '42',
          },
        ],
      });

    const result = await service.replaceAssignments('user-id', product.id, {
      attributes: [
        {
          attributeId: 'attribute-color',
          valueIds: ['value-black', 'value-white'],
        },
        { attributeId: 'attribute-size', valueIds: ['value-42'] },
      ],
    });

    expect(result).toEqual([
      {
        attributeId: 'attribute-color',
        code: 'color',
        name: 'Color',
        values: [
          { id: 'value-black', code: 'black', value: 'Black' },
          { id: 'value-white', code: 'white', value: 'White' },
        ],
      },
      {
        attributeId: 'attribute-size',
        code: 'size',
        name: 'Size',
        values: [{ id: 'value-42', code: '42', value: '42' }],
      },
    ]);
    expect(client.query.mock.calls[0]?.[1]).toEqual(['user-id', product.id]);
    expect(client.query.mock.calls[2]?.[1]).toEqual([
      ['attribute-color', 'attribute-size'],
      'category-id',
    ]);
    expect(client.query.mock.calls[5]?.[0]).toContain('DELETE FROM marketplace_product_attribute_assignments');
    expect(client.query.mock.calls[6]?.[1]).toEqual([
      product.id,
      product.category_id,
      'attribute-color',
    ]);
    expect(client.query.mock.calls[7]?.[1]).toEqual([
      product.id,
      product.category_id,
      'attribute-size',
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-id',
        action: 'MARKETPLACE_PRODUCT_ATTRIBUTES_REPLACED',
        resourceId: product.id,
      }),
      client,
    );
  });

  it('rejects an attribute configured for a different category', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [{ id: product.category_id }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.replaceAssignments('user-id', product.id, {
        attributes: [{ attributeId: 'phone-only-attribute', valueIds: ['value'] }],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(client.query.mock.calls[2]?.[0]).toContain(
      'attribute.category_id = $2',
    );
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  it('rejects values belonging to a different selected attribute', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [{ id: product.category_id }] })
      .mockResolvedValueOnce({ rows: [attributes[0]] })
      .mockResolvedValueOnce({ rows: [values[2]] });

    await expect(
      service.replaceAssignments('user-id', product.id, {
        attributes: [
          { attributeId: 'attribute-color', valueIds: ['value-42'] },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(client.query).toHaveBeenCalledTimes(4);
  });

  it('rejects disabled attributes and disabled values', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [{ id: product.category_id }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.replaceAssignments('user-id', product.id, {
        attributes: [
          { attributeId: 'disabled-attribute', valueIds: ['disabled-value'] },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    client.query.mockReset();
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [{ id: product.category_id }] })
      .mockResolvedValueOnce({ rows: [attributes[0]] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      service.replaceAssignments('user-id', product.id, {
        attributes: [
          { attributeId: 'attribute-color', valueIds: ['disabled-value'] },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects assignments when the product category is disabled', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.replaceAssignments('user-id', product.id, { attributes: [] }),
    ).rejects.toThrow(BadRequestException);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('does not allow a seller to manage another seller product', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.replaceAssignments('other-user-id', product.id, {
        attributes: [],
      }),
    ).rejects.toThrow(NotFoundException);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0]?.[1]).toEqual([
      'other-user-id',
      product.id,
    ]);
  });

  it('replaces existing selections and supports removing one assignment', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [{ id: product.category_id }] })
      .mockResolvedValueOnce({ rows: [attributes[0]] })
      .mockResolvedValueOnce({ rows: [values[0]] })
      .mockResolvedValueOnce({
        rows: [{
          attribute_id: 'attribute-color',
          attribute_value_id: 'old-value',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          attribute_id: 'attribute-color',
          attribute_code: 'color',
          attribute_name: 'Color',
          value_id: 'value-black',
          value_code: 'black',
          value: 'Black',
        }],
      });

    await service.replaceAssignments('user-id', product.id, {
      attributes: [
        { attributeId: 'attribute-color', valueIds: ['value-black'] },
      ],
    });
    expect(client.query.mock.calls[4]?.[0]).toContain('LEFT JOIN');
    expect(client.query.mock.calls[5]?.[0]).toContain(
      'DELETE FROM marketplace_product_attribute_assignments',
    );

    client.query.mockReset();
    client.query
      .mockResolvedValueOnce({ rows: [product] })
      .mockResolvedValueOnce({ rows: [{ attribute_id: 'attribute-color' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await service.removeAssignment(
      'user-id',
      product.id,
      'attribute-color',
    );
    expect(client.query.mock.calls[2]?.[0]).toContain(
      'DELETE FROM marketplace_product_attribute_assignments',
    );
  });

  it('rejects duplicate attribute assignments and duplicate values', async () => {
    await expect(
      service.replaceAssignments('user-id', product.id, {
        attributes: [
          { attributeId: 'attribute-color', valueIds: ['value-black'] },
          { attributeId: 'attribute-color', valueIds: ['value-white'] },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.replaceAssignments('user-id', product.id, {
        attributes: [
          {
            attributeId: 'attribute-color',
            valueIds: ['value-black', 'value-black'],
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('validates the assignment request shape and duplicate IDs', async () => {
    const dto = Object.assign(new ReplaceProductAttributesDto(), {
      attributes: [
        {
          attributeId: 'not-a-uuid',
          valueIds: ['also-not-a-uuid'],
        },
      ],
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.children?.length).toBeGreaterThan(0);
  });
});
