# Database

The database is PostgreSQL 15+ and migrations are applied by the API workspace migration runner. The runner executes migrations in order and records completed files in `schema_migrations`, so it is safe to run repeatedly.

## Requirements

- PostgreSQL 15+
- Node.js 20+
- npm 10+
- Dependencies installed with `npm install`

## Configuration

Copy `apps/api/.env.example` to `apps/api/.env` or export the variables in your shell. The migration runner accepts either `DATABASE_URL` or the individual `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, and `DATABASE_PASSWORD` variables. Set `DATABASE_SSL=true` when the database requires SSL.

Example local configuration:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nigeria_vtu_platform
DATABASE_SSL=false
```

## Create the database and apply all migrations

```bash
createdb nigeria_vtu_platform
npm install
npm --workspace apps/api run migrate
```

The runner applies these files in this exact order:

1. `database/migrations/0001_initial_schema.sql`
2. `database/migrations/0002_authentication.sql`
3. `database/migrations/0003_wallet_operations.sql`
4. `database/migrations/0005_feature_controls.sql`
5. `database/migrations/0006_system_wallets.sql`
6. `database/migrations/0007_payment_provider_initialization.sql`

If the database already exists, omit `createdb` and run the migration command. Each migration runs in its own transaction; a failed migration is rolled back and is not recorded as applied.

## Verification queries

After applying the migration:

```sql
\dt
\d ledger_entries
SELECT version, applied_at FROM schema_migrations ORDER BY version;
SELECT code, enabled FROM services ORDER BY code;
SELECT conname FROM pg_constraint WHERE conrelid = 'ledger_entries'::regclass;
```

## Important financial rules

- Amounts are integer minor units: kobo for NGN and cents for USD.
- `wallet_balances` is only a concurrency-optimized projection. The immutable `ledger_transactions` and `ledger_entries` tables are the accounting source of truth.
- Every posted ledger transaction must have balanced debit and credit entries in one database transaction.
- Holds are represented separately in `wallet_holds`; unresolved provider operations must retain their holds.
- `UNKNOWN` and `REQUIRES_VERIFICATION` are first-class transaction states. They must be verified before any safe retry or provider failover.
- No Data-to-Money tables or service codes are present.
- PIN/voucher values are represented as encrypted provider-delivered values; the schema does not generate them.
