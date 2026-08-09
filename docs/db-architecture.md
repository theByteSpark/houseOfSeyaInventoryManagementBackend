# Database Architecture

Status: proposal — target schema for the full feature set (dashboard,
warehouses, notifications, import/export, settings). This is a fresh
database, so there is no existing data to preserve or backfill — the schema
below can be written directly as the initial migration, no transitional
steps required.

## 1. Scope vs. current codebase

The backend already implements: users/roles (currently ADMIN, STAFF), category +
subcategory + product, stock movements, sales, purchases, vendors, customers,
and basic reports. Three changes to that existing code are folded into this
schema:

- **Subcategory is removed.** `Product` links directly to `Category` (flat,
  one level). No cascading category/subcategory selects needed in the UI.
- **Invoice/PDF generation is removed.** No dedicated model backed it
  (`sales.pdf.ts` rendered directly off `Sale`/`SaleItem`/`Customer`), so this
  is a pure code deletion in `sales.routes.ts` / `sales.controller.ts` /
  `sales.service.ts`, not a schema change.
- **Role expands from 2 values to 4, and gets warehouse scoping** — see §3.0.

## 2. Design principles

1. **One join table per many-to-many concept**, not one flag per feature —
   avoids schema churn later (e.g. `ProductStock` for product×warehouse).
2. **Every new module is flaggable** via a single `FeatureFlag` table, so
   route registration and UI nav items can be toggled without further schema
   changes.
3. **Generic over specific** where cardinality is unclear (e.g. `Setting` is
   key/value, not one column per setting).

## 3. Target schema

```
User ─┬─ PasswordResetToken
      ├─ Notification (optional owner)
      ├─ UserWarehouse ── Warehouse   (mapping table, 0-or-1 row per user for now)
      └─ role: USER | ADMIN | COMPANY_ADMIN | SUPER_ADMIN

Category ── Product ─┬─ StockMovement ── Warehouse
                      ├─ ProductStock ── Warehouse
                      ├─ SaleItem ── Sale ── Customer
                      └─ PurchaseItem ── Purchase ── Vendor

Setting (key/value)
FeatureFlag (key/enabled)
```

### 3.0 User, Role, Warehouse

`User` itself is unchanged from the current schema apart from the `Role`
enum gaining two values — no `warehouseId` column is added to `User`
directly (that's new surface area the existing table never had). Instead,
warehouse assignment is a separate mapping table, `UserWarehouse`:

```prisma
enum Role {
  USER            // warehouse-scoped, day-to-day operations
  ADMIN           // warehouse admin — manages one warehouse fully
  COMPANY_ADMIN   // company-wide — all warehouses, users, settings
  SUPER_ADMIN     // developer/platform-level access
}

model UserWarehouse {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  warehouseId String
  warehouse   Warehouse @relation(fields: [warehouseId], references: [id])
  createdAt   DateTime  @default(now())

  @@unique([userId])
}
```

- `@@unique([userId])` enforces "at most one warehouse per user" today
  without touching the `User` table — if multi-warehouse access is ever
  needed, drop that constraint; no migration on `User` required either way.
- `role in (USER, ADMIN)` → a `UserWarehouse` row must exist for that user.
- `role in (COMPANY_ADMIN, SUPER_ADMIN)` → no `UserWarehouse` row.
- Enforced at the application layer (`users.validation.ts` /
  `users.service.ts` on create/update), not a DB constraint.

Access scoping (`authorize.ts` middleware, extended):
- `USER` / `ADMIN`: look up the caller's `UserWarehouse` row, filter all
  warehouse-scoped queries (`ProductStock`, `StockMovement`,
  warehouse-specific views) to that `warehouseId`. `ADMIN` additionally can
  manage users mapped to their own warehouse.
- `COMPANY_ADMIN`: no warehouse filter — sees/manages all warehouses, all
  users, settings, feature flags, reports.
- `SUPER_ADMIN`: same as `COMPANY_ADMIN` plus any developer-only endpoints
  (e.g. feature flag toggles, raw diagnostics) if added later.

Warehouse gets the inverse relation:

```prisma
model Warehouse {
  id            String          @id @default(uuid())
  name          String          @unique
  code          String?         @unique
  address       String?
  isActive      Boolean         @default(true)
  userMappings  UserWarehouse[]
  stocks        ProductStock[]
  movements     StockMovement[]
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
}
```

### 3.1 Inventory (flattened category)

```prisma
model Category {
  id        String    @id @default(uuid())
  name      String    @unique
  products  Product[]
}

model Product {
  id             String          @id @default(uuid())
  sku            String          @unique
  name           String
  description    String?
  unitPrice      Decimal         @db.Decimal(10, 2)
  reorderLevel   Int             @default(0)
  categoryId     String?
  category       Category?       @relation(fields: [categoryId], references: [id])
  stocks         ProductStock[]
  saleItems      SaleItem[]
  purchaseItems  PurchaseItem[]
  stockMovements StockMovement[]
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
}
```

`Product` no longer carries `quantityInStock`. Quantity is stored **only**
on `ProductStock`, one row per product×warehouse (§3.2) — the single source
of truth. There is no cached/denormalized total on `Product`, so the two
numbers can never drift out of sync; a total across all warehouses is
computed on read (`SUM(quantity)` grouped by `productId`) wherever a
whole-product figure is needed (dashboard tiles, reports, low-stock checks
without a warehouse filter). No `Subcategory` model.

### 3.2 Warehouse management

`Warehouse` itself is defined in §3.0 (it carries the `users` relation for
the User↔Warehouse link). The stock side of it:

```prisma
model ProductStock {
  id           String    @id @default(uuid())
  productId    String
  product      Product   @relation(fields: [productId], references: [id])
  warehouseId  String
  warehouse    Warehouse @relation(fields: [warehouseId], references: [id])
  quantity     Int       @default(0)
  reorderLevel Int?      // per-warehouse override; falls back to Product.reorderLevel when null
  updatedAt    DateTime  @updatedAt

  @@unique([productId, warehouseId])
}
```

```prisma
enum StockMovementType {
  RESTOCK
  SALE
  ADJUSTMENT
}

model StockMovement {
  id          String            @id @default(uuid())
  productId   String
  product     Product           @relation(fields: [productId], references: [id])
  warehouseId String
  warehouse   Warehouse         @relation(fields: [warehouseId], references: [id])
  type        StockMovementType
  quantity    Int
  reason      String?
  createdAt   DateTime          @default(now())
}
```

`warehouseId` is required (not nullable) — since quantity only ever lives on
a specific `ProductStock` row now, every stock movement inherently happens
against one warehouse. There is no "global" adjustment path anymore.

**Impact on existing `inventory.service.ts` / `sales.service.ts` code:**
every place that currently reads or writes `Product.quantityInStock`
directly needs to move to `ProductStock`, scoped by warehouse:

- `createProduct`: initial stock (if any) is written as a `ProductStock`
  row for the caller's warehouse (via `UserWarehouse`), not a `Product`
  field.
- `restockProduct`: becomes `restockProduct(productId, warehouseId, qty)` —
  upserts the `ProductStock` row (`increment`) and writes a `StockMovement`
  with that `warehouseId`.
- `deductStockInTransaction` (used by `sales.service.ts` on sale issue):
  decrements the specific `ProductStock` row for the sale's warehouse
  instead of `Product.quantityInStock`.
- Low-stock filtering (`quantityInStock <= reorderLevel`, currently a raw
  SQL query in `listProductsPaginated`) becomes a query against
  `ProductStock.quantity <= COALESCE(ProductStock.reorderLevel,
  Product.reorderLevel)`, either per-warehouse or aggregated depending on
  the caller's role scope.
- `toProductDto` in the API response gains a `stockByWarehouse` array (or,
  for warehouse-scoped callers, a single `quantity` for their warehouse) in
  place of the flat `quantityInStock` field.

### 3.3 Notifications

```prisma
enum NotificationType {
  LOW_STOCK
  PURCHASE_RECEIVED
  SALE_ISSUED
  SYSTEM
}

model Notification {
  id        String           @id @default(uuid())
  userId    String?          // null = broadcast (e.g. all ADMINs)
  user      User?            @relation(fields: [userId], references: [id])
  type      NotificationType
  title     String
  message   String
  metadata  Json?            // e.g. { productId, warehouseId }
  readAt    DateTime?
  createdAt DateTime         @default(now())

  @@index([userId, readAt])
}
```

Populated by existing service logic (e.g. restock, low-stock check already
implicit in `quantityInStock <= reorderLevel`). Polling-based to start
(`GET /notifications`); websocket/SSE can be layered on later with no schema
change.

### 3.4 Settings

```prisma
model Setting {
  id        String   @id @default(uuid())
  key       String   @unique
  value     Json
  updatedAt DateTime @updatedAt
}
```

Single generic table for org-wide config (currency, tax rate, default
low-stock threshold, company profile, etc.) — avoids a migration every time a
new setting is added.

### 3.5 Feature flags

```prisma
model FeatureFlag {
  id      String  @id @default(uuid())
  key     String  @unique   // e.g. "warehouses", "notifications", "import-export"
  enabled Boolean @default(false)
}
```

- Backend: routes for a module are only registered (or return 404) when the
  corresponding flag is enabled — a one-line check per module in `app.ts`.
- Frontend: nav items and pages hidden the same way, keyed off the same flag
  names via a `/settings/flags` (or similar) endpoint.

### 3.6 Import/Export

No new tables for v1 — stateless CSV import/export endpoints over existing
`Product`, `Customer`, `Vendor` services. If async job tracking is needed
later (large files, progress %), add:

```prisma
enum ImportExportStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

model ImportExportJob {
  id           String              @id @default(uuid())
  type         String              // "product-import", "customer-export", ...
  status       ImportExportStatus  @default(PENDING)
  fileUrl      String?
  errorSummary String?
  requestedBy  String
  user         User                @relation(fields: [requestedBy], references: [id])
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
}
```

Deferred until synchronous import/export proves insufficient.

### 3.7 Access control is role-based only

No `Permission`/per-action grant model, now or planned. The 4-tier `Role`
in §3.0 (USER, ADMIN, COMPANY_ADMIN, SUPER_ADMIN) combined with
`UserWarehouse` scoping is the entire access-control mechanism —
`authorize.ts` middleware checks `role` (and, for warehouse-scoped roles,
the mapped `warehouseId`) directly, nothing more granular.

## 4. Unchanged models

`User`, `PasswordResetToken`, `Customer`, `Sale`, `SaleItem`, `Vendor`,
`Purchase`, `PurchaseItem` carry over as-is from the current schema (see
`prisma/schema.prisma`), minus the invoice/PDF route noted in §1. Only
`Role` gains two enum values; warehouse assignment lives entirely in the new
`UserWarehouse` table (§3.0), not on `User` itself.

## 5. Non-goals for this pass

- Real-time stock push (websocket/SSE) — layered on top of `Notification`
  and `ProductStock` later; no schema impact.
- Any per-action permission model — access control is role-based only, see §3.7.
- Multi-warehouse access per user — `UserWarehouse` is modeled as a mapping
  table so this is easy to lift later (drop the `@@unique([userId])`
  constraint), but v1 enforces exactly one warehouse per USER/ADMIN, by
  decision — see §3.0.
- Multi-tenant/org support — `Setting` and `FeatureFlag` are global, not
  scoped, matching current single-tenant assumption.
