# System Overview

> **Purpose:** What this service is, the stack it's built on, and how a request moves through it.
>
> **Related docs:** `setup.md` (running it) · `architecture/module-conventions.md` (module internals) · `database/schema-overview.md` (the data model)

---

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js + TypeScript, `tsx` for dev | `npm run dev` watches `src/server.ts` |
| Web framework | Express 5 | `src/app.ts` builds the app, `src/server.ts` starts it |
| Database | PostgreSQL via Prisma ORM 5 | Schema at `prisma/schema.prisma`, client at `@/config/db` |
| Validation | Zod | One schema file per module, `*.validation.ts` |
| Auth | JWT (access + refresh) + bcrypt | `src/utils/jwt.ts`, `src/modules/auth/` |
| Email | Resend | `src/utils/mailer.ts`, used only for password-reset codes |
| PDF | pdfkit | `src/modules/sales/sales.pdf.ts`, generates invoice PDFs |
| Path aliases | `@/*` → `src/*` | Set in `tsconfig.json`, resolved at build by `tsc-alias` |

## Folder Layout

```
src/
├── app.ts                 Express app: middleware, route mounting, 404, error handler
├── server.ts               Starts the HTTP listener on env.PORT
├── config/
│   ├── db.ts                 Prisma client singleton
│   └── env.ts                  Zod-validated environment variables
├── middleware/
│   ├── authenticate.ts          Verifies the access token, sets req.user
│   ├── authorize.ts              Role gate, used after authenticate
│   ├── validate.ts                Wraps a Zod schema as Express middleware
│   └── errorHandler.ts             Turns ApiError / unknown errors into JSON responses
├── modules/
│   └── <name>/
│       ├── <name>.routes.ts         Express Router, wires middleware + controller
│       ├── <name>.controller.ts      Req/res only — reads params, calls the service, writes the response
│       ├── <name>.service.ts          All business logic and Prisma calls
│       └── <name>.validation.ts        Zod schemas + their inferred TS types
└── utils/
    ├── apiError.ts             Typed HTTP errors with status codes
    ├── asyncHandler.ts          Wraps async route handlers so thrown errors reach errorHandler
    ├── pagination.ts             Shared page/sort/search parsing + response shape
    ├── params.ts                  requireParam() — typed, throws 400 if a route param is missing
    ├── jwt.ts                      Sign/verify access, refresh, and password-reset tokens
    └── mailer.ts                    Resend wrapper for the password-reset email
prisma/
├── schema.prisma            The single source of truth for the data model
├── migrations/                One folder per applied migration, timestamp-prefixed
└── seed.ts                     Idempotent (upsert-based) demo data
```

Eight modules exist today: `auth`, `users`, `customers`, `inventory`, `sales`, `vendors`, `purchases`, `reports`. Every one of them (except `reports`, which is read-only) follows the exact four-file shape above — see `architecture/module-conventions.md`.

## Request Lifecycle

1. **`app.ts`** applies `cors`, `express.json()`, `cookieParser()` globally, then mounts each module's router under `/api/v1/<module>`.
2. **Router** (`<name>.routes.ts`) applies `authenticate` (and `authorize(...)` where a route is role-restricted) and, for write routes, `validateBody(schema)`.
3. **Controller** reads `req.params`/`req.query`/`req.body`, calls exactly one service function, and shapes the HTTP response (status code, JSON body, or `204` with no body).
4. **Service** holds all business logic: Prisma queries, cross-model transactions, domain validation (e.g. "can't delete a category with subcategories"), and DTO mapping.
5. Any thrown `ApiError` (or unexpected error) is caught by `asyncHandler` and forwarded to **`errorHandler`**, which writes `{ error: message }` with the right status code.

## How a New Module Plugs In

Every module is self-contained under `src/modules/<name>/` and is wired into the app in exactly one place: the `app.use('/api/v1/<name>', <name>Routes)` line in `src/app.ts`. Nothing else needs to know a new module exists except whatever it depends on (e.g. `sales` imports `deductStockInTransaction` directly from `inventory.service.ts` — see `architecture/module-conventions.md`'s note on cross-module calls). For the exact steps, use `playbooks/add-a-new-module.md`.

## Deployment Notes

- `npm run build` compiles TypeScript to `dist/` and rewrites `@/` aliases via `tsc-alias`; `npm start` runs `dist/server.ts`'s compiled output.
- `DATABASE_URL` must point at a real Postgres instance before `prisma migrate deploy`/`generate` will work — see `foundation/setup.md`.
- CORS is origin-checked against `CORS_ORIGIN` plus a comma-separated `CORS_ORIGINS` list — both come from env, not hardcoded, so add a new frontend origin there rather than in `app.ts`.
