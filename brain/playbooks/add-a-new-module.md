# Playbook: Add a New Module

> **Purpose:** The exact, ordered steps to add a brand-new resource (e.g. "returns," "expenses," anything CRUD-shaped) to this backend, following the same conventions as the existing eight modules. Written so a human can review each step before it happens and an agent can execute it directly.
>
> **Related docs:** `../architecture/module-conventions.md` (the shape being followed) · `../database/schema-overview.md` and `data-conventions.md` (schema rules) · `../database/schema-overview.md`'s Migration History table (update it in Step 2)

**Worked example used throughout:** adding a `returns` module — customers returning purchased products, similar shape to `sales`.

---

## Step 1 — Decide the Shape Before Writing Code

Answer these first, in writing, in the PR description or task notes:

1. What model(s) does this need? (One, or a parent+line-items pair like `Sale`/`SaleItem`?)
2. Does it have a lifecycle/status enum, or is it simple CRUD with no state machine?
3. Does it read or write another module's data? (e.g. a `Return` restoring stock touches `inventory`'s `deductStockInTransaction`-style pattern in reverse.)
4. Who can access it — every authenticated user, or role-restricted like `users`?

## Step 2 — Schema First

1. Add the new model(s) to `prisma/schema.prisma`, following `../database/data-conventions.md`: UUID `id`, `Decimal(10,2)` for any money field, `createdAt`/`updatedAt` if the row is ever mutated after creation, an enum for any lifecycle status.
2. Run `npm run prisma:migrate` and give it a snake_case, change-describing name (e.g. `add_return_models`) — see `data-conventions.md` Rule 8.
3. Run `npm run prisma:generate`.
4. Add the new model(s) to `../database/schema-overview.md`: a row in the ER diagram, a "Tables, Field by Field" section, and a row in its Migration History table. Do this now, not after the module is built — the schema doc drifting from day one is how it stays permanently out of date (see `../GOLDEN_RULES.md` Rule 8).

## Step 3 — Validation File

Create `src/modules/<name>/<name>.validation.ts`:
- One Zod object schema per distinct input shape (create/update, plus any action-specific input like `restockInputSchema`).
- `z.coerce.number()` for numeric fields that might arrive as strings.
- Export the inferred `z.infer<typeof schema>` type next to each schema.

## Step 4 — Service File

Create `src/modules/<name>/<name>.service.ts`. For each operation, follow `../architecture/module-conventions.md`'s Service File section exactly:

- [ ] A `<Model>_INCLUDE` constant (`satisfies Prisma.<Model>Include`) if the model has relations to flatten.
- [ ] A private `toDto(...)` mapping function — convert every `Decimal` to `Number`, flatten one level of relation data.
- [ ] `list<Name>()` — full unfiltered list.
- [ ] `list<Name>Paginated(params, ...)` — using `PaginationParams`/`PaginatedResult<T>` from `@/utils/pagination`, with its own `<NAME>_SORTABLE_FIELDS` decided in the controller.
- [ ] `get<Name>(id)` — throws `ApiError.notFound(...)` if missing.
- [ ] `create<Name>(input)` — check any uniqueness constraint explicitly before writing, throw `ApiError.conflict(...)` if violated.
- [ ] `update<Name>(id, input)` — re-check existence and uniqueness the same way.
- [ ] `delete<Name>(id)` — if this model has dependents, block deletion with `ApiError.badRequest(...)` while any exist (see `deleteCategory`/`deleteVendor` for the pattern) rather than cascading.
- [ ] Any state transition (if this module has a lifecycle) — one function per transition or a shared `transition<Name>(id, status)` like `sales.service.ts`, with an explicit `if` guard per invalid transition.
- [ ] Any operation that must write to another module's data in the same transaction — import that module's exported transaction-helper function (like `deductStockInTransaction`) rather than duplicating its Prisma calls.

## Step 5 — Controller File

Create `src/modules/<name>/<name>.controller.ts`:
- One `<verb><Resource>Handler` function per route.
- `requireParam(req, 'id')` for route params, never `req.params.id!`.
- Branch list handlers on `isPaginationRequested(req)` per `../architecture/error-handling-and-pagination.md`.
- Status codes: `201` create, `200` read/update, `204` (no body) delete.
- No business logic here — if you're writing an `if` that decides *what* happens rather than *how to respond*, move it to the service.

## Step 6 — Routes File

Create `src/modules/<name>/<name>.routes.ts`:
- `router.use(authenticate)` at the top.
- `authorize('ADMIN')` (or relevant roles) per-route, only if this module should be more restricted than "any logged-in user."
- `validateBody(<schema>)` before every `POST`/`PATCH` controller.
- Wrap every handler in `asyncHandler(...)`.
- Order specific paths before general ones if there's a shared prefix.

## Step 7 — Wire It Into the App

In `src/app.ts`:
1. Import the router: `import { <name>Routes } from '@/modules/<name>/<name>.routes';`
2. Mount it: `app.use('/api/v1/<name>', <name>Routes);` — add it near the other `app.use('/api/v1/...')` lines, keeping the list in the same rough order as the modules exist in `src/modules/`.

This is the *only* place a new module needs to be registered — nothing else in `app.ts`/`server.ts` needs to change.

## Step 8 — Write Its Domain Doc

Create `brain/domains/<name>.md` following `../GOLDEN_RULES.md` Rule 10's shape: what it is → a rules table → a state-machine diagram if it has one → any cross-module dependency → an "Extending This Domain" section. Use `domains/sales-and-invoicing.md` as the template if it has a lifecycle, or `domains/inventory-and-stock.md` if it's closer to plain CRUD with delete-guards.

## Step 9 — Update the Map

Add a row for the new domain doc to `brain/README.md`'s "Where to Start" and "The Map" tables, in the same change.

## Step 10 — Tell the Frontend

This backend has no generated OpenAPI spec — the frontend's `brain/playbooks/add-a-new-feature.md` (sibling repo `houseOfSeyaInventoryManagement`) expects you to hand it: the base path (`/api/v1/<name>`), every route + method, the request body shape (mirror the Zod schema), and the response DTO shape (mirror `toDto()`'s output). Write this as a short comment or a section in the PR description — the frontend module doesn't get built from guessing the API shape.

## Verification Checklist Before Calling It Done

- [ ] `npm run build` compiles with no type errors.
- [ ] Every new route requires `authenticate`; role-restricted ones have `authorize(...)`.
- [ ] Every service function that can fail throws the right `ApiError` variant, not a raw `Error` or a manual `res.status(...)`.
- [ ] `schema-overview.md`, the new domain doc, and `brain/README.md`'s map are all updated in this same change.
- [ ] If this module writes to another module's data, it does so through that module's exported service function inside a shared `$transaction`, never by duplicating its Prisma queries.
