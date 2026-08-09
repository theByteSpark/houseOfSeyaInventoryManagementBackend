# Backend Code Architecture

Status: reference — documents the current backend codebase structure and
conventions, and where the planned changes (see
[`db-architecture.md`](./db-architecture.md)) plug into it. Read that doc
first for the schema; this doc covers the surrounding code.

## 1. Stack

- **Express 5** + **TypeScript**, run via `tsx watch` in dev, compiled with
  `tsc` + `tsc-alias` for the `@/` path alias in prod.
- **Prisma** (`@prisma/client`) over PostgreSQL.
- **Zod** for request validation.
- **JWT** (`jsonwebtoken`) for auth, `bcrypt` for password hashing.
- **Resend** for transactional email (password reset).
- **PDFKit** for invoice PDF generation — being removed, see
  `db-architecture.md` §1.

## 2. Entry point & request pipeline

```
server.ts → app.ts
```

- `server.ts`: starts the HTTP listener on `env.PORT`. No other logic.
- `app.ts`: builds the Express app —
  1. CORS (allow-list from `env.CORS_ORIGIN` / `env.CORS_ORIGINS`)
  2. `express.json()`
  3. `cookie-parser`
  4. `GET /health`
  5. one `app.use('/api/v1/<module>', <module>Routes)` per feature module
  6. 404 handler
  7. `errorHandler` (must stay last)

Every new feature module (warehouses, notifications, settings,
import-export) is wired in the same way: one `app.use('/api/v1/x',
xRoutes)` line in `app.ts`. This is also the exact seam the feature-flag
system (`db-architecture.md` §3.5) hooks into — wrapping a registration line
in a flag check, rather than restructuring anything.

## 3. Module structure (the pattern every feature follows)

Each `src/modules/<feature>/` folder has up to four files, always in this
dependency direction: `routes → controller → service → prisma`.

```
<feature>.routes.ts       Express Router: path + method + middleware wiring only
<feature>.controller.ts   Thin HTTP adapter: parse req, call service, shape res
<feature>.service.ts      All business logic + Prisma calls
<feature>.validation.ts   Zod schemas for request bodies (optional if no body)
```

Example (`inventory`):

```ts
// inventory.routes.ts
inventoryRoutes.post(
  '/products',
  validateBody(productInputSchema),   // from inventory.validation.ts
  asyncHandler(inventoryController.createProductHandler),
);
```

```ts
// inventory.service.ts
export async function createProduct(input: ProductInput) {
  // existence checks, prisma.product.create, DTO shaping
}
```

Controllers never call `prisma` directly — only services do. This keeps
warehouse-scoping logic (once added, per `db-architecture.md` §3.0) in one
place per feature rather than scattered across route handlers.

**DTO shaping convention**: services define a private `toXDto(...)` mapper
(see `inventory.service.ts`'s `toProductDto`) so Prisma's raw
`Decimal`/relation shapes never leak into API responses — numbers are
coerced with `Number(...)`, nested relations flattened to the fields the
frontend needs (e.g. `categoryName` instead of a nested `category` object).
New models (`ProductStock`, `Warehouse`, `Notification`, `Setting`) should
follow the same pattern.

**Pagination convention**: list endpoints needing search/sort/paging follow
the `listXPaginated(params, ...)` shape in `inventory.service.ts`, using the
shared `PaginationParams`/`PaginatedResult` types from `utils/pagination.ts`
— `{ page, pageSize, search, sortBy, sortDir }` in,
`{ data, total, page, pageSize }` out. Reuse this for `WarehousesListPage`
and any other new paginated list.

## 4. Cross-cutting middleware (`src/middleware/`)

- **`authenticate.ts`**: reads `Authorization: Bearer <token>`, verifies the
  JWT, attaches `req.user = { id, role }`. Every route module calls
  `xRoutes.use(authenticate)` once, at the top of its router.
- **`authorize.ts`**: `authorize(...roles: Role[])` — a factory returning
  middleware that 403s unless `req.user.role` is in the allow-list. Applied
  per-route where needed (e.g. `usersRoutes` restricting create/delete to
  `ADMIN` today).

  **Planned change**: once warehouse scoping lands (`db-architecture.md`
  §3.0), `authenticate.ts`'s `AuthenticatedUser` gains the caller's mapped
  `warehouseId` (looked up via `UserWarehouse` at auth time, not stored in
  the JWT payload, so a warehouse reassignment takes effect without
  requiring re-login... or attach it to the JWT payload for one fewer DB hit
  per request — pick one when implementing; not yet decided). Services for
  warehouse-scoped resources (`ProductStock`, `StockMovement`, restock) then
  filter by `req.user.warehouseId` when `role` is `USER`/`ADMIN`, and skip
  the filter for `COMPANY_ADMIN`/`SUPER_ADMIN`. This is a service-layer
  concern, not a new middleware — no new file needed, `authorize.ts` stays
  role-only exactly as it is today (see `db-architecture.md` §3.7: **no**
  permission model, role checks only).
- **`validate.ts`**: `validateBody(schema)` — parses `req.body` through a
  Zod schema, replacing it with the parsed/coerced result, or throws
  (caught by `errorHandler`).
- **`errorHandler.ts`**: last middleware in the chain. Maps `ApiError` →
  its `.status`/`.message`, `ZodError` → 400 with field errors, anything
  else → logged + generic 500. New code should always throw `ApiError.*`
  (see `utils/apiError.ts`) rather than crafting responses manually.

## 5. Shared utilities (`src/utils/`)

- **`apiError.ts`**: `ApiError` class with static helpers
  (`.notFound()`, `.conflict()`, `.badRequest()`, `.unauthorized()`,
  `.forbidden()`) — the only sanctioned way to signal an HTTP error from a
  service/controller.
- **`asyncHandler.ts`**: wraps an async route handler so rejected promises
  reach `errorHandler` instead of hanging/crashing — every route handler in
  every `*.routes.ts` file is wrapped in this.
- **`pagination.ts`**: `PaginationParams`/`PaginatedResult` types shared by
  every paginated list endpoint.
- **`params.ts`**: request param parsing helpers (e.g. coercing/validating
  route `:id` params, query pagination params).
- **`jwt.ts`**: sign/verify access & refresh tokens.
- **`mailer.ts`**: Resend wrapper for password-reset emails.

## 6. Config (`src/config/`)

- **`env.ts`**: single source of truth for environment variables — reads
  `process.env`, validates/defaults, exports a typed `env` object. Any new
  env var (e.g. a feature-flag default, a warehouse-related setting) is
  added here, not read from `process.env` ad hoc elsewhere.
- **`db.ts`**: the shared Prisma client singleton (`export const prisma =
  new PrismaClient()`), imported by every service — never instantiate a
  second `PrismaClient`.

## 7. Auth & authorization model today

- `Role` enum currently `ADMIN | STAFF` (Prisma), expanding to
  `USER | ADMIN | COMPANY_ADMIN | SUPER_ADMIN` per `db-architecture.md`
  §3.0.
- JWT payload carries `{ sub: userId, role }`; `authenticate.ts` trusts the
  role embedded at sign-time. Access token is short-lived, `refreshToken`
  stored hashed on `User` for rotation (see `auth.service.ts`).
- Route-level protection is two-layered: `authenticate` (must be logged in)
  then optionally `authorize(role1, role2, ...)` (must have one of these
  roles). There is no resource-level ownership check beyond this today
  (e.g. nothing stops one `ADMIN` from editing another's data) — this is
  exactly what warehouse scoping introduces for `USER`/`ADMIN`, implemented
  as a `where` clause addition in the relevant services, not a new
  middleware layer.

## 8. What changes where, per planned feature

Mapping each `db-architecture.md` addition to the code layer it touches:

| Schema addition | New/changed backend code |
|---|---|
| `UserWarehouse` | `users.service.ts` (assign/reassign), `authenticate.ts`/service layer (scoping lookup) |
| `ProductStock` (replaces `Product.quantityInStock`) | `inventory.service.ts` rewritten per `db-architecture.md` §3.2's "impact" note |
| `Warehouse` | new `modules/warehouses/` (routes/controller/service/validation), standard CRUD pattern |
| `Notification` | new `modules/notifications/`; triggered from `inventory.service.ts` (low stock) and `purchases.service.ts`/`sales.service.ts` (status events) |
| `Setting` | new `modules/settings/`, simple key/value CRUD |
| `FeatureFlag` | new `modules/settings/` (or a dedicated `modules/flags/`) + a small `isFeatureEnabled(key)` helper used in `app.ts` route registration |
| Import/Export | new `modules/import-export/`, reusing existing `Product`/`Customer`/`Vendor` services for the actual read/write, adding only CSV (de)serialization |
| Invoice/PDF removal | delete `sales.pdf.ts`; remove handler/route/service function per `db-architecture.md` §3 |
| Category flattening | `inventory.service.ts`/`.controller.ts`/`.routes.ts`/`.validation.ts` — drop all subcategory CRUD, switch `subcategoryId` → `categoryId` throughout |

No new architectural layer is introduced by any of this — every addition is
another folder following the §3 pattern, another `app.use()` line, and
(where warehouse-scoped) a `where` clause in the relevant service function.
