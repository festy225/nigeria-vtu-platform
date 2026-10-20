import { BadRequestException } from '@nestjs/common';
import { ProviderRegistryService } from '../src/modules/providers/registry/provider-registry.service';

describe('ProviderRegistryService.createProviderConfiguration', () => {
  const providerId = '550e8400-e29b-41d4-a716-446655440000';
  const secretRef = 'env:CHIMZO_TEST_PROVIDER_SECRET';

  let service: ProviderRegistryService;
  let database: { withTransaction: jest.Mock; query: jest.Mock };
  let audit: { record: jest.Mock };
  let client: { query: jest.Mock };

  const dto = {
    providerId,
    priority: 1,
    isPrimary: true,
    isBackup: false,
    enabled: true,
    secretRef,
  };

  beforeEach(() => {
    client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM api_providers')) {
          return { rows: [{ id: providerId }], rowCount: 1 };
        }

        if (sql.includes('FROM provider_configurations') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{ id: 'previous-primary' }],
            rowCount: 1,
          };
        }

        if (sql.includes('INSERT INTO provider_configurations')) {
          return {
            rows: [{
              id: 'new-configuration',
              provider_id: providerId,
              service_id: null,
              priority: 1,
              is_primary: true,
              is_backup: false,
              enabled: true,
              secret_ref: secretRef,
              config: {},
              updated_at: new Date('2026-01-01T00:00:00Z'),
            }],
            rowCount: 1,
          };
        }

        return { rows: [], rowCount: 1 };
      }),
    };

    database = {
      withTransaction: jest.fn(async (callback) => callback(client)),
      query: jest.fn(),
    };

    audit = { record: jest.fn().mockResolvedValue(undefined) };

    service = new ProviderRegistryService(
      database as never,
      audit as never,
    );
  });

  it('rejects an invalid secret reference before opening a transaction', async () => {
    await expect(
      service.createProviderConfiguration({
        ...dto,
        secretRef: 'plain-text-secret',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('rejects a configuration that is both primary and backup', async () => {
    await expect(
      service.createProviderConfiguration({
        ...dto,
        isBackup: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('locks the routing scope and demotes the previous primary before inserting', async () => {
    const result = await service.createProviderConfiguration(dto);

    expect(result.id).toBe('new-configuration');

    const statements = client.query.mock.calls.map(([sql]) => String(sql));

    expect(
      statements.some((sql) => sql.includes('pg_advisory_xact_lock')),
    ).toBe(true);

    expect(
      statements.some(
        (sql) =>
          sql.includes('UPDATE provider_configurations') &&
          sql.includes('SET is_primary = false'),
      ),
    ).toBe(true);

    expect(
      statements.some((sql) => sql.includes('INSERT INTO provider_configurations')),
    ).toBe(true);

    const lockIndex = statements.findIndex((sql) =>
      sql.includes('pg_advisory_xact_lock'),
    );
    const demotionIndex = statements.findIndex(
      (sql) =>
        sql.includes('UPDATE provider_configurations') &&
        sql.includes('SET is_primary = false'),
    );
    const insertIndex = statements.findIndex((sql) =>
      sql.includes('INSERT INTO provider_configurations'),
    );

    expect(lockIndex).toBeLessThan(demotionIndex);
    expect(demotionIndex).toBeLessThan(insertIndex);
  });

  it('rejects a primary configuration that is disabled', async () => {
    await expect(
      service.createProviderConfiguration({
        ...dto,
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(database.withTransaction).not.toHaveBeenCalled();
  });
});

describe('ProviderRegistryService.updateProviderConfiguration', () => {
  const configurationId = '660e8400-e29b-41d4-a716-446655440000';
  const actorId = 'super-admin-id';
  const secretRef = 'env:CHIMZO_TEST_PROVIDER_SECRET';

  let service: ProviderRegistryService;
  let database: { withTransaction: jest.Mock; query: jest.Mock };
  let audit: { record: jest.Mock };
  let client: { query: jest.Mock };

  const currentRow = {
    id: configurationId,
    provider_id: 'provider-id',
    service_id: null,
    priority: 10,
    is_primary: false,
    is_backup: true,
    enabled: true,
    secret_ref: secretRef,
    config: { region: 'NG' },
    updated_at: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM provider_configurations') && sql.includes('FOR UPDATE')) {
          return { rows: [{ ...currentRow }], rowCount: 1 };
        }

        if (sql.includes('UPDATE provider_configurations') && sql.includes('RETURNING')) {
          return {
            rows: [{
              ...currentRow,
              priority: 2,
              is_primary: true,
              is_backup: false,
              config: { region: 'NG', timeoutMs: 3000 },
              updated_at: new Date('2026-10-15T00:00:00Z'),
            }],
            rowCount: 1,
          };
        }

        return { rows: [], rowCount: 1 };
      }),
    };

    database = {
      withTransaction: jest.fn(async (callback) => callback(client)),
      query: jest.fn(),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ProviderRegistryService(database as never, audit as never);
  });

  it('rejects an invalid secret reference before opening a transaction', async () => {
    await expect(
      service.updateProviderConfiguration(configurationId, { secretRef: 'plain-text-secret' }),
    ).rejects.toThrow('secretRef must use the env:VARIABLE_NAME format');

    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('returns not found when the configuration does not exist', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM provider_configurations') && sql.includes('FOR UPDATE')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(
      service.updateProviderConfiguration(configurationId, { priority: 2 }),
    ).rejects.toThrow('Provider configuration not found');
  });

  it('rejects a configuration that would be both primary and backup', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM provider_configurations') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{ ...currentRow, is_primary: true, is_backup: false }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(
      service.updateProviderConfiguration(configurationId, { isBackup: true }),
    ).rejects.toThrow('A provider configuration cannot be both primary and backup');
  });

  it('locks the route, demotes another primary, updates settings, and audits without secrets', async () => {
    const result = await service.updateProviderConfiguration(
      configurationId,
      { priority: 2, isPrimary: true, isBackup: false, config: { region: 'NG', timeoutMs: 3000 } },
      actorId,
    );

    expect(result.id).toBe(configurationId);

    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    const lockIndex = statements.findIndex((sql) => sql.includes('pg_advisory_xact_lock'));
    const demotionIndex = statements.findIndex(
      (sql) => sql.includes('SET is_primary = false'),
    );
    const updateIndex = statements.findIndex(
      (sql) => sql.includes('SET priority = $2') && sql.includes('RETURNING'),
    );

    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(demotionIndex).toBeGreaterThan(lockIndex);
    expect(updateIndex).toBeGreaterThan(demotionIndex);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId,
        action: 'PROVIDER_CONFIGURATION_UPDATED',
        resourceId: configurationId,
      }),
      client,
    );

    const auditPayload = JSON.stringify(audit.record.mock.calls[0][0]);
    expect(auditPayload).not.toContain(secretRef);
    expect(auditPayload).not.toContain('timeoutMs');
  });
});
