# Nigerian VTU Platform

This is the initial foundation for a production-ready Nigerian VTU and digital-services platform.

The repository is intentionally structured for future product expansion, with separate frontend and backend applications and a shared types package.

## Included foundation

- Separate `apps/web` frontend built with Next.js
- Separate `apps/api` backend built with NestJS
- Shared types package for future cross-app contracts
- Root workspace configuration for local development orchestration
- Environment templates for frontend and backend configuration
- Documentation folder with setup and architecture guidance
- Versioned PostgreSQL schema migration covering platform foundation entities
- Git hygiene files and coding standards

## Important note

This repository does not implement real provider integrations or credentials. Business service flows will be added after the foundation and database layer are reviewed.

## Database

The schema is in `database/migrations/0001_initial_schema.sql`. See `docs/database/README.md` for setup and verification instructions.

## Local development

1. Install dependencies:

```bash
npm install
```

2. Start the API:

```bash
npm run dev:api
```

3. Start the frontend:

```bash
npm run dev:web
```

4. Or run both together:

```bash
npm run dev
```

## Default ports

- Frontend: http://localhost:3000
- API: http://localhost:3001
