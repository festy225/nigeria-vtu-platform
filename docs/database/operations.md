# Database Operations

The database foundation is deliberately implemented as a SQL migration so the initial schema is explicit, reviewable, and independent of an ORM choice.

Before adding application repositories, choose one migration runner for subsequent migrations (for example, node-pg-migrate, Flyway, or Prisma Migrate) and make it the only production migration mechanism. Do not edit an applied migration.

Recommended next database work:

1. Add a database connection module with a pool and transaction helper.
2. Add repositories for users, wallets, ledger postings, and service transactions.
3. Add a posting service that locks wallet rows and writes balanced ledger entries atomically.
4. Add state-transition enforcement in the application and database-level audit triggers where appropriate.
5. Add integration tests against PostgreSQL.
