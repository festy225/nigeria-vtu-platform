# Development Setup

## Prerequisites

- Node.js 20+
- npm 10+

## Install dependencies

```bash
npm install
```

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

## Build commands

```bash
npm run build
```

```bash
npm run build:api
```

```bash
npm run build:web
```

## Type checking

```bash
npm run typecheck
```

## Notes

- Do not add real provider secrets to the repository.
- Use `.env` or your cloud secret manager for actual local environment config.
- Keep provider credentials and admin secrets out of the browser and out of source control.
