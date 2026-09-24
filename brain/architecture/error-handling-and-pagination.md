# Error Handling & Pagination

> **Purpose:** The two shared contracts every module uses instead of reinventing errors or list endpoints per-module.
>
> **Related docs:** `module-conventions.md` (where these get used inside a module)

---

## Errors — `ApiError`

`src/utils/apiError.ts` defines one error class with a `status` and factory methods:

| Factory | Status | Use when |
|---|---|---|
| `ApiError.badRequest(msg)` | 400 | Input is well-formed but violates a business rule (e.g. "Only draft sales can be edited") |
| `ApiError.unauthorized(msg?)` | 401 | Missing/invalid/expired auth token |
| `ApiError.forbidden(msg?)` | 403 | Authenticated, but role doesn't permit this action |
| `ApiError.notFound(msg?)` | 404 | A looked-up record doesn't exist |
| `ApiError.conflict(msg)` | 409 | A uniqueness constraint would be violated |

**Rule:** always `throw`, never `return`, an `ApiError` from a service. Because every route handler is wrapped in `asyncHandler` (`src/utils/asyncHandler.ts`), a thrown error — sync or from a rejected promise — is passed to Express's `next()` automatically and lands in `errorHandler` (`src/middleware/errorHandler.ts`), which writes `{ error: err.message }` with `err.status` (defaulting to 500 for anything that isn't an `ApiError`).

Never write a raw `res.status(4xx).json(...)` inside a controller for a business-logic error — that bypasses the one place (`errorHandler`) that decides response shape, and makes error responses inconsistent across modules.

## Pagination, Search, and Sort

`src/utils/pagination.ts` defines the one contract every list endpoint uses when a caller wants a page instead of the full list.

### Request Side

| Query param | Type | Behavior |
|---|---|---|
| `page` | number | 1-indexed. Its mere presence is what triggers pagination — see below. |
| `pageSize` | number | Must be one of `10`, `20`, `50` (`ALLOWED_PAGE_SIZES`); anything else silently falls back to `10`. |
| `search` | string | Trimmed, case-insensitive `contains` match — each module's service defines which fields it searches. |
| `sortBy` | string | Only honored if it's in that endpoint's own allow-list (e.g. `PRODUCT_SORTABLE_FIELDS` in `inventory.controller.ts`) — an unlisted value is ignored, not rejected. |
| `sortDir` | `'asc' \| 'desc'` | Defaults to `desc`. |

### The Dual-Mode List Pattern

Every list endpoint supports **two response shapes from the same route**, chosen by whether `page` is present:

```ts
if (!isPaginationRequested(req)) {
  res.json(await service.listX());          // plain array, no wrapper
  return;
}
const params = parsePaginationParams(req, X_SORTABLE_FIELDS);
res.json(await service.listXPaginated(params));  // PaginatedResult<T>
```

This exists because some frontend call sites want every row (e.g. populating a `<select>`) and others want a paged table — one endpoint, two service functions (`listX` / `listXPaginated`), same DTO shape per row.

### Response Shape (`PaginatedResult<T>`)

```ts
{ data: T[], total: number, page: number, pageSize: number }
```

`total` is the count *after* filters (search/status), computed via `prisma.$transaction([prisma.model.count({ where }), prisma.model.findMany({ where, skip, take, orderBy })])` so the count and the page are consistent with each other.

**Rule for a new list endpoint:** define its own `<X>_SORTABLE_FIELDS` array in the controller (don't share one across modules — sortable fields differ per resource), and write both a `listX()` and `listXPaginated(params, ...)` service function even if `listX()` is only used by other modules or dropdowns today.

## Not-Found vs. Empty List

A `listX()`/`listXPaginated()` returning zero rows is a normal 200 with `[]` or `{ data: [], total: 0, ... }` — never an error. `ApiError.notFound` is only for a *specific* record looked up by ID that doesn't exist (`getProduct`, `getSale`, etc.).
