import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../src/common/auth/auth.decorators';
import { RolesGuard } from '../src/common/auth/roles.guard';
import { MarketplaceAttributeController } from '../src/modules/sellers/marketplace-attribute.controller';
import { MarketplaceAttributeService } from '../src/modules/sellers/marketplace-attribute.service';

type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;

describe('MarketplaceAttributeService', () => {
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
  const service = new MarketplaceAttributeService(
    database as never,
    audit as never,
  );
  const attribute = {
    id: 'attribute-id',
    category_id: 'category-id',
    code: 'finish',
    name: 'Finish',
    enabled: true,
    sort_order: 0,
  };
  const attributeValue = {
    id: 'value-id',
    attribute_id: attribute.id,
    code: 'matte',
    value: 'Matte',
    enabled: true,
    sort_order: 0,
  };

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

  it('creates an attribute for an enabled category and audits it', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: attribute.category_id }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [attribute] });

    const result = await service.createAttribute('admin-user-id', 'category-id', {
      code: ' FINISH ',
      name: ' Finish ',
      sortOrder: 2,
    });

    expect(result).toEqual(attribute);
    expect(client.query.mock.calls[1]?.[0]).toContain('enabled = true');
    expect(client.query.mock.calls[3]?.[1]).toEqual([
      'category-id',
      'finish',
      'Finish',
      2,
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-user-id',
        action: 'MARKETPLACE_PRODUCT_ATTRIBUTE_CREATED',
        resourceId: attribute.id,
      }),
      client,
    );
  });

  it('rejects duplicate attribute codes or names within a category', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'category-id' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-attribute-id' }] });

    await expect(
      service.createAttribute('admin-user-id', 'category-id', {
        code: 'finish',
        name: 'Another label',
      }),
    ).rejects.toThrow(ConflictException);

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects attribute creation for a disabled or missing category', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.createAttribute('admin-user-id', 'disabled-category-id', {
        code: 'finish',
        name: 'Finish',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('lists enabled attributes only within the requested category', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [{ id: 'category-id' }] })
      .mockResolvedValueOnce({ rows: [attribute] });

    const result = await service.listEnabledCategoryAttributes('category-id');

    expect(result).toEqual([attribute]);
    expect(database.query.mock.calls[1]?.[1]).toEqual(['category-id']);
    expect(database.query.mock.calls[1]?.[0]).toContain('enabled = true');
  });

  it('allows an administrator to disable an attribute without changing its category', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [attribute] })
      .mockResolvedValueOnce({ rows: [{ id: attribute.category_id }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...attribute, enabled: false }] });

    const result = await service.updateAttribute(
      'admin-user-id',
      attribute.id,
      { enabled: false },
    );

    expect(result).toMatchObject({
      id: attribute.id,
      category_id: attribute.category_id,
      enabled: false,
    });
    expect(client.query.mock.calls[4]?.[1]?.[4]).toBe(attribute.id);
  });

  it('creates allowed values under an enabled attribute', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [attribute] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [attributeValue] });

    const result = await service.createAttributeValue(
      'admin-user-id',
      attribute.id,
      { code: 'MATTE', value: 'Matte' },
    );

    expect(result).toEqual(attributeValue);
    expect(client.query.mock.calls[1]?.[0]).toContain(
      'category.enabled = true',
    );
    expect(client.query.mock.calls[3]?.[1]).toEqual([
      attribute.id,
      'matte',
      'Matte',
      0,
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-user-id',
        action: 'MARKETPLACE_PRODUCT_ATTRIBUTE_VALUE_CREATED',
        resourceId: attributeValue.id,
      }),
      client,
    );
  });

  it('rejects duplicate values within an attribute', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [attribute] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-value-id' }] });

    await expect(
      service.createAttributeValue('admin-user-id', attribute.id, {
        code: 'matte',
        value: 'Other label',
      }),
    ).rejects.toThrow(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects value creation under a disabled attribute', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.createAttributeValue('admin-user-id', attribute.id, {
        code: 'matte',
        value: 'Matte',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not list values for a disabled attribute or disabled category', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.listEnabledAttributeValues(attribute.id),
    ).rejects.toThrow(NotFoundException);
    expect(database.query.mock.calls[0]?.[0]).toContain(
      'attribute.enabled = true',
    );
    expect(database.query.mock.calls[0]?.[0]).toContain(
      'category.enabled = true',
    );
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  it('lists enabled values only for public reads', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [attribute] })
      .mockResolvedValueOnce({ rows: [attributeValue] });

    const result = await service.listEnabledAttributeValues(attribute.id);

    expect(result).toEqual([attributeValue]);
    expect(database.query.mock.calls[1]?.[0]).toContain('enabled = true');
    expect(database.query.mock.calls[1]?.[1]).toEqual([attribute.id]);
  });

  it('allows an administrator to disable an attribute value', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [attributeValue] })
      .mockResolvedValueOnce({ rows: [attribute] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...attributeValue, enabled: false }],
      });

    const result = await service.updateAttributeValue(
      'admin-user-id',
      attributeValue.id,
      { enabled: false },
    );

    expect(result).toMatchObject({
      id: attributeValue.id,
      attribute_id: attribute.id,
      enabled: false,
    });
    expect(client.query.mock.calls[4]?.[1]?.[4]).toBe(attributeValue.id);
  });

  it('allows Super Admin configuration and rejects non-admin users', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const handler =
      MarketplaceAttributeController.prototype.createAttribute;
    Reflect.defineMetadata(ROLES_KEY, ['SUPER_ADMIN'], handler);
    const contextFor = (roles: string[]) =>
      ({
        getHandler: () => handler,
        getClass: () => MarketplaceAttributeController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { roles } }),
        }),
      }) as never;

    expect(guard.canActivate(contextFor(['SUPER_ADMIN']))).toBe(true);
    expect(() => guard.canActivate(contextFor(['CUSTOMER']))).toThrow(
      'Insufficient permissions',
    );
    expect(
      reflector.get<string[]>(ROLES_KEY, handler),
    ).toEqual(['SUPER_ADMIN']);
  });

  it('exposes public attribute reads through the marketplace feature gate', () => {
    const reflector = new Reflector();
    const handler =
      MarketplaceAttributeController.prototype.listEnabledCategoryAttributes;

    expect(reflector.get<boolean>('isPublic', handler)).toBe(true);
    expect(reflector.get('requiredFeature', handler)).toBe(
      'MARKETPLACE_ENABLED',
    );
  });
});
