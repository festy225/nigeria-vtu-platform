import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../src/infrastructure/database/database.service';

describe('DatabaseService.withTransaction', () => {
  let database: DatabaseService;
  let client: {
    query: jest.Mock;
    release: jest.Mock;
  };

  beforeEach(() => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'DATABASE_URL') return undefined;
        if (key === 'DATABASE_SSL') return 'false';
        return fallback;
      }),
    };

    database = new DatabaseService(config as unknown as ConfigService);

    client = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    };

    const connectSpy = jest.spyOn(
      database.pool,
      'connect',
    ) as jest.SpyInstance;
    connectSpy.mockResolvedValue(client as unknown as PoolClient);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await database.pool.end();
  });

  it('commits successful work and releases the connection', async () => {
    const result = await database.withTransaction(async () => 'success');

    expect(result).toBe('success');
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'COMMIT',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith();
  });

  it('rolls back failed work, preserves the original error, and releases', async () => {
    const originalError = new Error('operation failed');

    await expect(
      database.withTransaction(async () => {
        throw originalError;
      }),
    ).rejects.toBe(originalError);

    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'ROLLBACK',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith();
  });

  it('discards the connection if rollback fails and preserves the original error', async () => {
    const originalError = new Error('operation failed');
    const rollbackError = new Error('rollback failed');

    client.query.mockImplementation(async (sql: string) => {
      if (sql === 'ROLLBACK') throw rollbackError;
      return { rows: [], rowCount: 0 };
    });

    await expect(
      database.withTransaction(async () => {
        throw originalError;
      }),
    ).rejects.toBe(originalError);

    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'ROLLBACK',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(rollbackError);
  });

  it('rolls back when COMMIT fails and preserves the commit error', async () => {
    const commitError = new Error('commit failed');

    client.query.mockImplementation(async (sql: string) => {
      if (sql === 'COMMIT') throw commitError;
      return { rows: [], rowCount: 0 };
    });

    await expect(
      database.withTransaction(async () => 'result'),
    ).rejects.toBe(commitError);

    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
