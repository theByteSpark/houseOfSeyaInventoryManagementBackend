# Domain: Bulk Import (CSV/Excel)

> **Purpose:** How CSV/Excel bulk import works for Product, Customer, Vendor, Sale, and Purchase — the column contracts, matching rules, and the one-row-one-record limitation. Module: `src/modules/import-export/`.
>
> **Related docs:** `../architecture/module-conventions.md` (the code shape, mostly followed here except this module has no `.validation.ts` — rows are validated by hand per-cell so a bad row doesn't fail the whole file) · `inventory-and-stock.md` (`Product`/`Category`/`Subcategory`/`StockMovement` rules this import must respect) · `sales-and-invoicing.md` and `purchases-and-vendors.md` (the `Sale`/`Purchase` creation rules this import reuses) · `../database/schema-overview.md`

---

## What This Is

A file-upload endpoint per entity that turns a spreadsheet into rows of `Product`, `Customer`, `Vendor`, `Sale`, or `Purchase` records. Each entity has a matching `GET .../template` endpoint that returns a starter CSV or Excel file with the exact expected columns and two sample rows, so a user always has a known-good file to start from instead of guessing column names.

No `xlsx`/SheetJS dependency is used anywhere in this feature — `src/utils/csv.ts` is a small dependency-free CSV parser/writer, and `src/utils/excel.ts` uses `exceljs` (actively maintained) for `.xlsx` reading and template generation. This was a deliberate choice: `xlsx`/SheetJS has unpatched CVEs and the actual requirement here is simple tabular import/export, not general spreadsheet manipulation.

## The One-Row-One-Record Limitation

**Every row in a Sales or Purchases import creates exactly one `Sale`/`Purchase` with exactly one line item.** There is no row-grouping — if a customer bought 3 different designs in one transaction, that's 3 rows and 3 separate `Sale` records (3 separate `saleNumber`s), not one sale with 3 `SaleItem`s. This is a scope decision, not a bug: grouping rows into a multi-line sale/purchase would need an explicit grouping key (e.g. a shared order reference column) that the current column contracts don't have. If multi-line grouping is ever needed, that's a new column plus a group-by pass before the create calls, not a small tweak to the row loop.

## Endpoints

All routes require `authenticate` only — no `authorize('ADMIN')` gate. Bulk-importing is normal operational work, the same permission level as creating a `Sale` or `Customer` by hand.

| Method | Path | Body/Query | Behavior |
|---|---|---|---|
| `GET` | `/api/v1/import/products/template` | `?format=xlsx` optional (default CSV) | Downloads a template file with the Product columns and 2 sample rows |
| `POST` | `/api/v1/import/products` | multipart `file` field, `.csv`/`.xlsx`/`.xls` | Upserts products by `designNumber` |
| `GET` | `/api/v1/import/customers/template` | `?format=xlsx` optional | Downloads the Customer template |
| `POST` | `/api/v1/import/customers` | multipart `file` | Upserts customers by `email` |
| `GET` | `/api/v1/import/vendors/template` | `?format=xlsx` optional | Downloads the Vendor template |
| `POST` | `/api/v1/import/vendors` | multipart `file` | Upserts vendors by `companyName` (case-insensitive) |
| `GET` | `/api/v1/import/sales/template` | `?format=xlsx` optional | Downloads the Sale template |
| `POST` | `/api/v1/import/sales` | multipart `file` | Creates one `DRAFT` sale per row |
| `GET` | `/api/v1/import/purchases/template` | `?format=xlsx` optional | Downloads the Purchase template |
| `POST` | `/api/v1/import/purchases` | multipart `file` | Creates one `DRAFT` purchase per row |

The upload accepts a `.csv`, `.xlsx`, or `.xls` file up to 5MB (`multer`, memory storage — nothing is written to disk). `parseCsvObjects`/`parseExcel` both turn the file into an array of `Record<string, string>` row objects keyed by header name, so every `<entity>.import.ts` file works from the same shape regardless of which format was uploaded.

## Column Contracts

### Products (`products.import.ts`) — upsert by `designNumber`

| Column | Required | Notes |
|---|---|---|
| `designNumber` | Yes | Match key |
| `name` | Yes | |
| `categoryName` | No | Only applied if `subcategoryName` is also given — see below |
| `subcategoryName` | No | Only applied if `categoryName` is also given |
| `metalType` | Yes | Free text (normally one of the `METAL` `AttributeOption` labels) |
| `grossWeight` | Yes | Positive number, grams |
| `metalRatePerGram` | Yes | Positive number |
| `diamondShape` | No | |
| `diamondQuality` | No | |
| `diamondPieces` | No | Non-negative integer |
| `diamondCaratWeight` | No | Number |
| `diamondWeight` | No | Number, reference-only field, matches `Product.diamondWeight` |
| `diamondRate` | No | Number, per carat |
| `makingChargePerGram` | Yes | Non-negative number |
| `fixedExpense` | No | Non-negative number, defaults to `0` |
| `sellingPrice` | Yes | Positive number |
| `quantityInStock` | No | Non-negative integer, defaults to `0` — **only used on create** |
| `reorderLevel` | No | Non-negative integer, defaults to `0` |

Rules:
- **Diamond fields are independent** — unlike `productInputSchema`'s UI-driven all-or-nothing pair check on carat weight/rate, the importer parses whatever diamond fields are given and leaves the rest `null`. Keeps the row format forgiving for bulk data entry.
- If both `categoryName` and `subcategoryName` are given, `Category` is upserted by `name` and `Subcategory` upserted by `(categoryId, name)` — same two-step upsert `prisma/seed.ts` uses. Giving only one of the two is treated as "no classification," not an error.
- **Update path never touches `quantityInStock`** — matches `updateProduct`'s behavior (`inventory.service.ts`), since stock only ever changes through a paired `StockMovement` write, never a plain field update.
- **Create path with `quantityInStock > 0`** writes one `StockMovement` (`type: RESTOCK`, `reason: 'Bulk import'`) — mirrors `createProduct`'s `'Initial stock'` write, just with an import-specific reason string so the audit trail (`GET /inventory/products/:id/movements`) can tell the two apart.

### Customers (`customers.import.ts`) — upsert by `email`

| Column | Required | Notes |
|---|---|---|
| `name` | Yes | |
| `email` | No | Match key — `Customer.email` is nullable and **not unique** in the schema, so a row with no email always creates a new customer rather than risking a false match |
| `phone` | No | |
| `address` | No | |

If `email` is given and `prisma.customer.findFirst({ where: { email } })` finds a row, that customer is updated; otherwise a new one is created.

### Vendors (`vendors.import.ts`) — upsert by `companyName`

| Column | Required | Notes |
|---|---|---|
| `companyName` | Yes | Match key, case-insensitive |
| `contactPerson` | No | |
| `email` | No | |
| `phone` | No | |
| `address` | No | |

Matched with `findFirst({ where: { companyName: { equals, mode: 'insensitive' } } })`, same case-insensitive lookup `purchases.import.ts` uses to resolve `vendorName` on the Purchases import.

### Sales (`sales.import.ts`) — always creates, never updates

| Column | Required | Notes |
|---|---|---|
| `customerEmail` | Yes | Looked up via `findFirst({ where: { email } })` — row errors if no match |
| `designNumber` | Yes | Looked up via `findUnique` — row errors if no match |
| `quantity` | Yes | Positive integer |

Each row becomes one `Sale` (`status: 'DRAFT'`) with one `SaleItem`. `unitPrice` is snapshotted from `Product.sellingPrice` at import time (same as `createSale`). `subtotal = lineTotal`, `tax = subtotal × TAX_RATE` (the same `0.03` flat rate exported from `sales.service.ts` — there is no per-row tax-rate column, since the app has no per-sale tax override anymore), `total = subtotal + tax`. `saleNumber` comes from `nextSaleNumber()`, exported from `sales.service.ts` and reused here rather than reimplemented. Stock is **not** touched — same as any other `DRAFT` sale, deduction only happens on issue.

### Purchases (`purchases.import.ts`) — always creates, never updates

| Column | Required | Notes |
|---|---|---|
| `vendorName` | Yes | Looked up case-insensitively — row errors if no match |
| `designNumber` | Yes | Looked up via `findUnique` — row errors if no match |
| `quantity` | Yes | Positive integer |
| `unitCost` | Yes | Non-negative number |
| `vendorInvoiceNumber` | No | |
| `vendorInvoiceDate` | No | Must parse as a valid date if given |

Each row becomes one `Purchase` (`status: 'DRAFT'`) with one `PurchaseItem` (`receivedQuantity: 0`). `purchaseNumber` comes from `nextPurchaseNumber()`, exported from `purchases.service.ts` and reused here. Stock is **not** touched — same as any other `DRAFT` purchase, stock only moves on `receivePurchaseItems`.

## Row-Level Error Handling

Every import function processes rows independently — one bad row never aborts the file. Each function returns:

```json
{
  "results": [{ "row": 2, "designNumber": "RNG-ENG-001", "status": "created" }, ...],
  "createdCount": 5,
  "updatedCount": 2,
  "errorCount": 1
}
```

(`updatedCount` is omitted from the Sales/Purchases result shape since those two never update — they only ever create or error.)

`row` is 1-indexed and accounts for the header row, so `row: 2` means the first data row. The identifying field per result (`designNumber`, `name`, `companyName`, `saleNumber`, `purchaseNumber`) is present on `created`/`updated` rows; on an `error` row the identifying field falls back to whatever was parsed (or `'(missing)'` if the required column itself was blank), and `message` carries the specific validation or lookup failure.

An upload that parses to zero data rows throws `ApiError.badRequest('The uploaded file has no data rows.')` before any per-row processing starts.

## Extending This Domain

- **A new importable entity**: add `<entity>.import.ts` following the exact shape of the five here (`build<Entity>ImportTemplate` + `import<Entity>s`, per-row try/catch, `{ results, createdCount, updatedCount?, errorCount }`), then wire its `GET .../template` and `POST` pair into `import-export.routes.ts` and dispatch functions into `import-export.controller.ts`.
- **Row-grouping for multi-line Sales/Purchases**: would need a shared group key column (e.g. `saleNumber`/an external order reference) and a group-by pass before the create calls — not attempted here, see the limitation section above.
