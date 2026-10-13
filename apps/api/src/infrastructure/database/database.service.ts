import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.get<string>('DATABASE_URL'),
      host: config.get<string>('DATABASE_HOST'),
      port: config.get<number>('DATABASE_PORT', 5432),
      database: config.get<string>('DATABASE_NAME'),
      user: config.get<string>('DATABASE_USER'),
      password: config.get<string>('DATABASE_PASSWORD'),
      max: config.get<number>('DATABASE_POOL_MAX', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: config.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : undefined
    });
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let releaseError: Error | undefined;

    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        releaseError =
          rollbackError instanceof Error
            ? rollbackError
            : new Error(String(rollbackError));
      }

      // Preserve the original transaction error for the caller.
      throw error;
    } finally {
      // A failed rollback means this connection must not be reused.
      if (releaseError) {
        client.release(releaseError);
      } else {
        client.release();
      }
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
