# Development Setup

## Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 15+

## Install dependencies

```bash
npm install
```

## Configure the applications

Copy the environment templates before starting the applications:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Set a real `JWT_ACCESS_SECRET` in `apps/api/.env`. For local PostgreSQL, the default database settings in the template target `nigeria_vtu_platform` on `localhost:5432`.

## Create the database and run migrations

```bash
createdb nigeria_vtu_platform
npm --workspace apps/api run migrate
```

The migration command is ordered and repeatable. See `docs/database/README.md` for the migration list and configuration details.

## Local development commands

```bash
npm run dev
```

Runs both the API and frontend together.

```bash
npm run dev:api
```

Runs only the backend.

```bash
npm run dev:web
```

Runs only the frontend.

## Build and validation commands

```bash
npm run typecheck
npm run lint
npm run build
```

## Health checks

With the API running, use:

```bash
curl http://localhost:3001/api/v1/health
curl http://localhost:3001/api/v1/health/database
```

The application health endpoint reports `status: "ok"` or `status: "degraded"`. The database-specific endpoint returns a service-unavailable response when PostgreSQL cannot be reached.

## Notes

- Do not add real provider secrets to the repository.
- Use `.env` or your cloud secret manager for actual local environment config.
- Keep provider credentials and admin secrets out of the browser and out of source control.
