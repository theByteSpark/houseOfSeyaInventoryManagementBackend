# Local Setup & Operations

> **Purpose:** How to get this backend running locally, what every env var does, and the Prisma commands you'll actually use.
>
> **Related docs:** `overview.md` (architecture this setup runs) · `../database/schema-overview.md` (what the seed data populates)

---

## Prerequisites

- Node.js (a version matching `@types/node ^26` in `package.json` — use the current LTS or newer)
- A running PostgreSQL instance, reachable at the URL you'll put in `DATABASE_URL`

## First-Time Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in real values (see table below) — never commit `.env`.
3. `npm run prisma:generate` — generates the Prisma client from `schema.prisma`.
4. `npm run prisma:migrate` — applies all migrations in `prisma/migrations/` to your database (creates it if it doesn't exist, given a valid connection string).
5. `npm run prisma:seed` — inserts one admin user + demo categories/products/customers. Safe to re-run; it's upsert-based (see `prisma/seed.ts`).
6. `npm run dev` — starts the API on `http://localhost:PORT` (default `4000`) with hot reload via `tsx watch`.

## Environment Variables

Defined and validated in `src/config/env.ts` (Zod schema — the app refuses to start if one is missing or malformed).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Postgres connection string, e.g. `postgresql://user@localhost:5432/house_of_seya?schema=public` |
| `PORT` | No | `4000` | HTTP port the server listens on |
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test` |
| `JWT_ACCESS_SECRET` | Yes | — | Signs short-lived access tokens |
| `JWT_REFRESH_SECRET` | Yes | — | Signs long-lived refresh tokens (separate secret from access, deliberately) |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token lifetime |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Primary allowed frontend origin |
| `CORS_ORIGINS` | No | — | Comma-separated extra allowed origins (e.g. a deployed frontend URL) |
| `RESEND_API_KEY` | No | — | Needed only for password-reset emails to actually send; without it, `mailer.ts` calls will fail at send time, not at boot |
| `RESEND_FROM_EMAIL` | No | `House of Seya <onboarding@resend.dev>` | From-address for password-reset emails |

**Never** put real secrets in `.env.example` — it exists to show shape, not values.

## Prisma Commands You'll Actually Use

| Command | Does |
|---|---|
| `npm run prisma:generate` | Regenerate the Prisma client after any `schema.prisma` change |
| `npm run prisma:migrate` | Create + apply a new migration in dev (prompts for a name); wraps `prisma migrate dev` |
| `npx prisma migrate deploy` | Apply existing migrations without creating a new one — use this in production/CI |
| `npm run prisma:seed` | Re-run `prisma/seed.ts` |
| `npx prisma studio` | Visual DB browser — fastest way to eyeball data while developing |

**Rule:** never hand-edit a file inside `prisma/migrations/`. If a migration is wrong, add a new migration that corrects it — the migration history is the audit trail (see `../database/data-conventions.md`).

## Build & Run in Production

```
npm run build   # tsc -p tsconfig.json && tsc-alias -p tsconfig.json  →  dist/
npm start        # node dist/server.js
```

`npm start` expects `DATABASE_URL` and both JWT secrets to already be set in the process environment (not `.env` — that's dev-only via `dotenv/config`, though `env.ts` imports it unconditionally so a `.env` file present in production would still be read).

## Common Pitfalls

- Forgetting `prisma:generate` after pulling a schema change someone else made — TypeScript will show stale Prisma types until you regenerate.
- Running the app from the wrong working directory — commands assume you're in the repo root (unlike `AI-pricing-engine`'s `product/` split, this repo has no such nesting; `cd` is not required).
- A missing `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` fails loudly at boot (`env.ts` calls `process.exit(1)`) — read the printed field errors, don't guess.
