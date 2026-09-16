# Database schema verification workflow

The migration can be verified locally with PostgreSQL:

```bash
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/nigeria_vtu_platform'
createdb nigeria_vtu_platform
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/0001_initial_schema.sql
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
psql "$DATABASE_URL" -c "SELECT code FROM services ORDER BY code;"
```

The expected service list includes Airtime, Data, Electricity, TV subscription, Betting, Airtime-to-Money, Voucher, Data Printing, and E-commerce. It intentionally excludes Data-to-Money.
