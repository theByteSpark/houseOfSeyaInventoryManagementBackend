# Module Conventions

> **Purpose:** The exact shape every module follows, so a new module looks like the existing eight instead of inventing its own pattern.
>
> **Related docs:** `error-handling-and-pagination.md` (shared utilities every layer uses) · `../playbooks/add-a-new-module.md` (step-by-step build recipe using this shape)

---

## The Four-File Shape

Every module lives at `src/modules/<name>/` and holds exactly these files (skip a file only if the module has nothing for it — e.g. `reports` has no `.validation.ts` because it has no writes):

| File | Role | Imports from | Never imports from |
|---|---|---|---|
| `<name>.routes.ts` | Declares the Express `Router`, attaches middleware, maps HTTP verb+path → controller function | `express`, middleware, `./  .controller`, `./.validation` | Prisma, other modules' services |
| `<name>.controller.ts` | Translates HTTP ↔ service calls. No business logic, no Prisma. | `express` types, `@/utils/params`, `@/utils/pagination`, `./.service` | Prisma directly |
| `<name>.service.ts` | All business logic, all Prisma calls, DTO mapping | `@/config/db` (prisma client), `@/utils/apiError`, `./.validation` types, occasionally another module's `.service` | Express types |
| `<name>.validation.ts` | Zod schemas for request bodies + their inferred TS types | `zod` | everything else |

**Rule:** business logic belongs in the service file, full stop. If a controller has an `if` statement deciding *what* to do (not just *how to respond*), that logic has leaked out of the service — move it.

## Routes File

- Apply `authenticate` once per router with `router.use(authenticate)` — every route in every module today requires a logged-in user.
- Apply `authorize('ADMIN')` (or other roles) per-route, after `authenticate`, only where a route is role-restricted (see `users.routes.ts` for the pattern — user management is admin-only).
- Wrap every handler in `asyncHandler(...)` so a thrown error (including `ApiError`) reaches `errorHandler` instead of crashing the process or hanging the request.
- Apply `validateBody(schema)` on every route that accepts a body (`POST`/`PATCH`), before the controller.
- Order routes so more specific paths come before less specific ones sharing a prefix (e.g. `/products/:id/restock` before a hypothetical catch-all).

## Controller File

- One exported function per route, named `<verb><Resource>Handler` (e.g. `createProductHandler`, `listProductsHandler`).
- Use `requireParam(req, 'id')` (from `@/utils/params`) instead of `req.params.id!` — it throws a clean 400 if the param is genuinely missing, instead of an obscure downstream error.
- Status codes: `200` for reads/updates, `201` for creates, `204` with `res.status(204).send()` (no body) for deletes.
- List endpoints that support both a full unpaginated list and a paginated view branch on `isPaginationRequested(req)` (see `error-handling-and-pagination.md`) — don't build two separate endpoints for the same resource.

## Service File

- Export one `async function` per operation, named after the operation, not the HTTP verb (`createProduct`, not `postProduct`).
- Every "does this exist" check throws `ApiError.notFound(...)` before doing anything else with the record — never assume a Prisma `findUnique` returned non-null without checking.
- Every uniqueness constraint enforced by the DB (a `@unique` field) is *also* checked in the service first, with `ApiError.conflict(...)`, so the caller gets a clean 409 with a message instead of a raw Postgres constraint error. See `createProduct`'s SKU check as the pattern.
- A private `toDto(...)` function maps the raw Prisma result to the shape returned over the wire — this is where `Decimal` fields become `Number(...)`, and where a flattened field like `subcategoryName` gets pulled out of a nested `include`. Keep DTO shape and Prisma shape visually close so the mapping is easy to audit.
- A `<Model>_INCLUDE` (or `_SELECT`) constant, typed with `satisfies Prisma.<Model>Include`, defines the one shape used by every read of that model in the file — don't repeat an inline `include` object across functions.
- Multi-write operations that must succeed or fail together use `prisma.$transaction([...])` (array form for independent operations) or `prisma.$transaction(async (tx) => {...})` (callback form when operation N needs operation N-1's result). See `sales.service.ts`'s `issueSale`/`transitionSale` for the callback form with an explicit `{ timeout, maxWait }`.
- **Cross-module calls are allowed and expected** where one domain's write must affect another's data in the same transaction — e.g. `sales.service.ts` imports `deductStockInTransaction` from `inventory.service.ts` so stock deduction and the sale-status update commit atomically. Import the specific function you need; never reach into another module's Prisma models directly by duplicating its queries.

## Validation File

- One Zod object schema per distinct input shape (e.g. `productInputSchema` for create+update, a separate `restockInputSchema` for the restock action).
- Use `z.coerce.number()` for anything arriving as a query string or possibly-stringified body field (form-encoded numbers, quantities) — see `productInputSchema`.
- Export the inferred type alongside the schema: `export type ProductInput = z.infer<typeof productInputSchema>;` — controllers and services import the type, never redeclare it.
- Optional string fields that come from an HTML form (which sends `''`, not `undefined`, for a cleared field) use `.optional().or(z.literal(''))` — see `subcategoryId` in `productInputSchema`.

## Naming Conventions

- Files: `<name>.<layer>.ts`, all lowercase, matching the module folder name.
- Prisma models: `PascalCase` singular (`Product`, `StockMovement`).
- Routes: plural REST nouns (`/products`, `/categories`), nested sub-resources use a path segment (`/products/:id/restock`, `/products/:id/movements`).
- DTOs returned to the frontend use `camelCase` and flatten one level of relation naming (`categoryName` instead of making the frontend read `subcategory.category.name`).
