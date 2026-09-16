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
- Git hygiene files and coding standards

## Important note

This repository is the technical foundation only. It does not implement business services, provider integrations, payment flows, or actual VTU logic yet.

## Repository structure

```text
.
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   └── shared/
├── docs/
├── .env.example
├── .gitignore
├── .editorconfig
├── .gitattributes
├── .nvmrc
├── package.json
└── README.md
```

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

## Environment files

- Root `.env.example`
- `apps/web/.env.example`
- `apps/api/.env.example`

Copy these to `.env` or use your local environment manager as needed.

## Future roadmap

Planned implementation phases include:

- User roles and permissions
- Wallet and ledger architecture
- Transaction lifecycle and idempotency
- Provider adapters and backup routing
- Service modules for airtime, data, electricity, TV, vouchers, and e-commerce
- Admin dashboard and audit tooling
- Agent and vendor workflows
- Security, monitoring, and reconciliation
