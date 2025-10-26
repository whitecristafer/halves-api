<div align="center">

# Halves API (Fastify + Prisma)

Dating-style backend API in TypeScript (ESM) using Fastify v5 and Prisma (PostgreSQL).

<img alt="Database schema" src="./hLPVQnj747-_Jp7afLAGalIbb2Dnqb0AmRGuRGm5OuxLxKYtw6vNtTsphSI1j8Ns8OLy5LFgrf1Q_GgdRzJPM-IxhTnLeNcHPdypE_kR-UsVUs8iqxQkogGG7A52MoXk_C1OrAZiSe4cCNCX5qop2aeXqM6WDCNs72YjiCjlxB94q9XR9cSb9ec7uSwXGNq7c05dmAi4uAxWATIru71qi7.png" width="820" />

[Open API EXAMPLE →](./API-EXAMPLE.md)

</div>

## Overview

Halves API implements core features for a swipe/match/messaging app:
- Auth with Access + Refresh tokens (JWT, DB-persisted refresh)
- User profile (GET/PATCH), photos upload with ordering
- Preferences (age, genders, distance), feed filtered by prefs and blocks
- Like/dislike interactions and match creation on mutual like
- Matches list and chat messages with cursor pagination
- Blocking/reporting

Stack:
- Runtime: Node.js (TypeScript ESM)
- Web: Fastify v5 (+ CORS, JWT, Multipart, Static)
- DB: PostgreSQL via Prisma
- Validation: Zod (+ zod-validation-error)
- Logging: Pino (pretty in dev)

See also Russian docs: [README-RU.md](./README-RU.md)

## Quick start

Prerequisites:
- Node 18+ and npm
- Docker (for local Postgres)

1) Start database

```powershell
docker compose up -d
```

2) Configure environment

Create `.env` (or set env vars) with at least:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/halves?schema=public"
JWT_ACCESS_SECRET="dev-access-secret"
JWT_REFRESH_SECRET="dev-refresh-secret"
# Optional defaults:
# JWT_ACCESS_TTL=15m
# JWT_REFRESH_TTL=30d
# UPLOAD_DIR=./uploads
# CORS_ORIGIN=http://localhost:5173
```

3) Migrate, generate, seed (optional)

```powershell
npm run prisma:migrate
npm run prisma:generate
npm run db:seed
```

4) Run the API (dev)

```powershell
npm run dev
```

The server starts at http://localhost:3000

## API docs

Contract, examples, and behavior notes are in: [API-EXAMPLE.md](./API-EXAMPLE.md)

Highlights:
- JWT Bearer auth on all non-/auth routes
- Cursor pagination via Base64(JSON) cursors
- Static uploads at `/uploads/*` from `UPLOAD_DIR`
- Feed de-duplication: users shown in the last ~1 hour are skipped and marked as seen

## Testing

The repo uses Vitest with Fastify `inject()` so no real port binding is needed.

Common commands:

```powershell
npm install
npm run prisma:generate
npm run prisma:migrate
npm run test
# or
npm run test:watch
```

Tips:
- You can point tests to a separate DB by setting `DATABASE_URL_TEST`. The test setup will use it and truncate data between tests.

## Project structure

```
src/
	app.ts            # buildApp() to construct Fastify instance
	index.ts          # runtime entry — listens on a port
	env.ts            # Zod-validated environment
	plugins/prisma.ts # Prisma client on Fastify instance
	routes/           # Route modules (auth, me, photos, preferences, feed, like, matches, messages, blocks, reports)
	utils/            # shared helpers (auth guard, cursor, error helpers)
prisma/
	schema.prisma     # DB schema
	migrations/       # SQL migrations
	seed.ts           # optional seed data
tests/              # vitest specs (+ helpers)
uploads/            # static uploads (served at /uploads/)
```

## Notes

- ESM is enabled via `"type": "module"`; use ESM imports only
- Ensure `UPLOAD_DIR` exists; app creates it if missing
- Respect `CORS_ORIGIN` during local dev (default http://localhost:5173)

## License

MIT