# Database

The initial schema is PostgreSQL and is maintained as a versioned SQL migration.

## Requirements

- PostgreSQL 15+
- `psql` available on the PATH
- A database URL or equivalent connection environment variables

## Apply the migration

```bash
createdb nigeria_vtu_platform
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/0001_initial_schema.sql
```

The migration enables `pgcrypto` and `citext`. It creates the identity, wallet/ledger, service, provider, transaction, voucher, data-printing, bulk, e-commerce, notification, audit, API, webhook, and reconciliation tables.

## Important financial rules

- Amounts are integer minor units: kobo for NGN and cents for USD.
- `wallet_balances` is only a concurrency-optimized projection. The immutable `ledger_transactions` and `ledger_entries` tables are the accounting source of truth.
- Every posted ledger transaction must have balanced debit and credit entries in one database transaction.
- Holds are represented separately in `wallet_holds`; unresolved provider operations must retain their holds.
- `UNKNOWN` and `REQUIRES_VERIFICATION` are first-class transaction states. They must be verified before any safe retry or provider failover.
- No Data-to-Money tables or service codes are present.
- PIN/voucher values are represented as encrypted provider-delivered values; the schema does not generate them.

## Verification queries

After applying the migration:

```sql
\dt
\d ledger_entries
SELECT code, enabled FROM services ORDER BY code;
SELECT conname FROM pg_constraint WHERE conrelid = 'ledger_entries'::regclass;
```

For ledger reconciliation, application code should periodically assert that each `ledger_transaction_id` has equal debit and credit totals and matching currency wallets.
