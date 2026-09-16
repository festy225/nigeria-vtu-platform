# Architecture Overview

This project is structured as a clean monorepo with a separate frontend and backend to support a scalable VTU and digital-services platform.

## Stack

- Frontend: Next.js + React + TypeScript
- Backend: NestJS + TypeScript
- Database: PostgreSQL
- Cache/Queue: Redis
- Shared contracts: local workspace package
- Deployment: container-based environment with cloud hosting options

## Modular design

### Frontend

The frontend (`apps/web`) is responsible for user experience only. It never stores secrets or directly communicates with payment or VTU providers.

### Backend

The backend (`apps/api`) is responsible for authentication, authorization, wallet logic, transaction control, provider routing, admin tools, and service orchestration.

### Shared package

The shared package (`packages/shared`) contains cross-application types for common contracts such as roles, currencies, transaction states, and API response wrappers.

## Current implementation status

This repository includes the technical skeleton only. Example areas intentionally left for future implementation:

- Provider adapters
- Wallet ledger logic
- Service business flows
- Admin dashboards
- Agent/vendor approval workflows
- E-commerce checkout and payment flow
- VTU product and voucher logic

## Communication flow

```text
Frontend -> API -> Core application services -> Database/Redis
                      -> Provider adapters -> External providers
```

The frontend and backend communicate through a typed API contract pattern. Provider credentials are not exposed to the browser.
