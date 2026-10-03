import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../src/common/auth/auth.decorators';
import { RolesGuard } from '../src/common/auth/roles.guard';
import { MarketplaceCategoryController } from '../src/modules/sellers/marketplace-category.controller';
import { MarketplaceCategoryService } from '../src/modules/sellers/marketplace-category.service';

type QueryFunction = (
  query: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;

describe('MarketplaceCategoryService', () => {
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
  const service = new MarketplaceCategoryService(
    database as never,
    audit as never,
  );
  const rootCategory = {
    id: 'root-category-id',
    parent_id: null,
    slug: 'root',
    name: 'Root',
    description: null,
    enabled: true,
    sort_order: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    database.withTransaction.mockImplementation(
      (work: (value: typeof client) => unknown) => work(client),
    );
    database.query.mockResolvedValue({ rows: [], rowCount: 0 });
    client.query.mockResolvedValue({ rows: [], rowCount: 0 });
    audit.record.mockResolvedValue(undefined);
  });

  it('creates a category under an existing parent and audits it', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: rootCategory.id }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          ...rootCategory,
          id: 'child-category-id',
          parent_id: rootCategory.id,
          slug: 'child',
          name: 'Child',
        }],
      });

    const result = await service.createCategory('admin-user-id', {
      parentId: rootCategory.id,
      slug: ' child ',
      name: ' Child ',
    });

    expect(result.parent_id).toBe(rootCategory.id);
    expect(client.query.mock.calls[3]?.[1]).toEqual([
      rootCategory.id,
      'child',
      'Child',
      null,
      0,
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-user-id',
        action: 'MARKETPLACE_CATEGORY_CREATED',
        resourceType: 'MARKETPLACE_PRODUCT_CATEGORY',
        resourceId: 'child-category-id',
      }),
      client,
    );
  });

  it('lists only enabled categories and returns parent IDs for hierarchy', async () => {
    const child = { ...rootCategory, id: 'child-id', parent_id: rootCategory.id };
    database.query.mockResolvedValueOnce({
      rows: [rootCategory, child],
    });

    const result = await service.listEnabledCategories();

    expect(result).toEqual([rootCategory, child]);
    expect(database.query.mock.calls[0]?.[0]).toContain('WHERE enabled = true');
    expect(database.query.mock.calls[0]?.[0]).toContain('parent_id');
  });

  it('does not return a disabled category from category lookup', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.getEnabledCategory('disabled-category-id'),
    ).rejects.toThrow(NotFoundException);
    expect(database.query.mock.calls[0]?.[0]).toContain(
      'id = $1 AND enabled = true',
    );
  });

  it('rejects nonexistent parent references', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.createCategory('admin-user-id', {
        parentId: 'missing-parent-id',
        slug: 'child',
        name: 'Child',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects parent changes that would create a cycle', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [rootCategory] })
      .mockResolvedValueOnce({ rows: [{ id: 'child-category-id' }] })
      .mockResolvedValueOnce({ rows: [{ creates_cycle: true }] });

    await expect(
      service.updateCategory('admin-user-id', rootCategory.id, {
        parentId: 'child-category-id',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('updates a category without changing its ID and supports disabling', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [rootCategory] })
      .mockResolvedValueOnce({
        rows: [{ ...rootCategory, enabled: false, name: 'Updated' }],
      });

    const result = await service.updateCategory(
      'admin-user-id',
      rootCategory.id,
      { enabled: false, name: 'Updated' },
    );

    expect(result.id).toBe(rootCategory.id);
    expect(result.enabled).toBe(false);
    expect(client.query.mock.calls[2]?.[1]?.[6]).toBe(rootCategory.id);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MARKETPLACE_CATEGORY_UPDATED',
        resourceId: rootCategory.id,
      }),
      client,
    );
  });
});

describe('MarketplaceCategoryController authorization metadata', () => {
  it('makes category reads public and requires Super Admin for management', () => {
    const controller = MarketplaceCategoryController.prototype;
    const reflector = new Reflector();

    expect(
      reflector.get<boolean>('isPublic', controller.listEnabledCategories),
    ).toBe(true);
    expect(
      reflector.get<string[]>(ROLES_KEY, controller.createCategory),
    ).toEqual(['SUPER_ADMIN']);
    expect(
      reflector.get<string[]>(ROLES_KEY, controller.updateCategory),
    ).toEqual(['SUPER_ADMIN']);
  });

  it('allows a Super Admin and rejects a non-admin for category management', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const handler = MarketplaceCategoryController.prototype.createCategory;
    Reflect.defineMetadata(ROLES_KEY, ['SUPER_ADMIN'], handler);
    const contextFor = (roles: string[]) =>
      ({
        getHandler: () => handler,
        getClass: () => MarketplaceCategoryController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { roles } }),
        }),
      }) as never;

    expect(guard.canActivate(contextFor(['SUPER_ADMIN']))).toBe(true);
    expect(() => guard.canActivate(contextFor(['CUSTOMER']))).toThrow(
      'Insufficient permissions',
    );
  });
});
