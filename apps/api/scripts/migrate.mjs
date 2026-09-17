import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrations = [
  '0001_initial_schema.sql',
  '0002_authentication.sql',
  '0003_wallet_operations.sql',
  '0005_feature_controls.sql'
];
const migrationsDirectory = resolve(__dirname, '../../../database/migrations');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT ? Number(process.env.DATABASE_PORT) : undefined,
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version varchar(255) PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const migration of migrations) {
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [migration]);
    if (applied.rowCount) {
      console.log(`Skipping ${migration} (already applied)`);
      continue;
    }

    const sql = await readFile(join(migrationsDirectory, migration), 'utf8');
    console.log(`Applying ${migration}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [migration]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  console.log('Database migrations complete.');
} catch (error) {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
} finally {
  await client.end();
}
