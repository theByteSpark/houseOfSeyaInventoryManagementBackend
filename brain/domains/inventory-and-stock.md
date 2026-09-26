# Domain: Inventory & Stock

> **Purpose:** Business rules for categories, subcategories, products, and stock movements — what's allowed, what's blocked, and why.
>
> **Related docs:** `../database/schema-overview.md` (the tables) · `../architecture/module-conventions.md` (the code shape) · `enquiries.md` (the pricing-free sibling of this domain) · module: `src/modules/inventory/`

---

## The Hierarchy

`Category` → `Subcategory` → `Product`. A product's `subcategoryId` is nullable — a product can exist unclassified, but if it has a subcategory, that subcategory must belong to a category (enforced by the FK chain, not optional at that level).

## Jewelry Costing (Product as a Cost Sheet)

Since migration `20260924120000`, `Product` isn't just a catalog row — it's a costing sheet. Every formula below runs in `inventory.service.ts`'s `toProductDto()`, computed fresh on every read from the raw inputs stored on `Product` — none of the results are stored columns (see `../database/data-conventions.md` and `../GOLDEN_RULES.md` on derived-not-stored fields). A product has **exactly one diamond block** (`diamondShape`/`diamondQuality`/`diamondPieces`/`diamondCaratWeight`/`diamondWeight`/`diamondRate`, all plain columns on `Product` since migration `20260925180000`) — not a repeatable list.

| Term | Formula |
|---|---|
| Metal Cost | `grossWeight × metalRatePerGram` |
| Diamond Cost | `diamondCaratWeight × diamondRate` (`diamondWeight` is a client-requested reference field and never enters this formula) |
| Labour Cost | `makingChargePerGram × grossWeight` (the same `grossWeight` as Metal Cost) |
| Total Cost | Metal Cost + Diamond Cost + Labour Cost + `fixedExpense` |
| Tax | `Total Cost × 0.03` (the `TAX_RATE` constant in `inventory.service.ts`, a flat 3% — the same fixed rate `sales.service.ts` charges on a sale's subtotal, see `sales-and-invoicing.md`) |
| Final Amount | Total Cost + Tax |
| Selling Price | **not derived** — a required manual input (`Product.sellingPrice`), shown next to Final Amount as a reference figure only |

The frontend (`ProductFormPage.tsx`) recomputes the exact same formulas live for instant feedback as the user types; this service's computation is the authority once saved — a client-sent computed number is never trusted.

**All six diamond fields are required** on `productInputSchema` (`inventory.validation.ts`) — confirmed with the client that every design always has a diamond, there's no metal-only product. The columns stay nullable at the DB level only because pre-existing rows created before this rule was confirmed have no value — same reasoning `../database/schema-overview.md` already gives for `metalType`/`grossWeight` being nullable ("nullable only because rows created before this migration have no value"). An earlier version made these fields independently optional with a cross-field `.refine()` requiring `diamondCaratWeight`/`diamondRate` as a pair; that refine was removed once the fields became outright required — it can never be violated when both are always present.

## Attribute Options (Metal / Diamond Shape / Diamond Quality Picklists)

`src/modules/attributeOptions/` is a small standalone module backing the dropdowns for `Product.metalType` and `Product.diamondShape`/`diamondQuality`. `GET /api/v1/attribute-options?type=METAL|DIAMOND_SHAPE|DIAMOND_QUALITY` is open to any authenticated user (staff need it to fill out the product form); create/update/delete are `authorize('ADMIN')`-gated, managed from the frontend's `/settings/attributes` page. See `../database/data-conventions.md` Rule 10 for why this has no foreign key into `Product` — deleting an option is always safe, it only affects the picker for new entries.

## Rules

| Rule | Enforced in | Exit condition |
|---|---|---|
| Category names are globally unique | `createCategory`/`updateCategory` — explicit `findUnique` + `ApiError.conflict` before write, backed by `@unique` in schema | Rename or pick a different name |
| Subcategory names are unique *within* a category, not globally | `@@unique([categoryId, name])`, checked in `createSubcategory`/`updateSubcategory` | Two categories can each have a "Cotton" subcategory |
| Product Design Number is globally unique | `createProduct`/`updateProduct` | Rename the design number |
| A category can't be deleted while it has subcategories | `deleteCategory` checks `_count.subcategories > 0` → 400 | Delete or reassign every subcategory first |
| A subcategory can't be deleted while it has products or enquiries | `deleteSubcategory` checks `_count.products > 0`, then `prisma.enquiry.count({ where: { subcategoryId } })` → 400 either way | Delete/reassign every product and enquiry first |
| A product that has ever been sold (any `SaleItem`, regardless of the sale's status) can't be deleted | `deleteProduct` checks `_count.saleItems > 0` → 400, `ApiError.badRequest('Cannot delete a product that has been sold.')` — sale history must never be silently orphaned | Sale history is permanent; there is no path to delete a sold product |
| A product with only purchase/stock-movement history (never sold) can still be deleted | `deleteProduct` deletes its `PurchaseItem` and `StockMovement` rows in the same `$transaction` as the `Product` delete, once the sale-history check above passes | N/A — deliberately allows removing a design that was ordered/received but never sold |
| `quantityInStock` never changes without a paired `StockMovement` row | Convention, not a DB constraint — every write path (`createProduct` initial stock, `restockProduct`, `deductStockInTransaction`, purchase receiving) writes both in the same operation/transaction | N/A — this is a code discipline, watch for it in review |

## Stock Movements

An append-only ledger (`StockMovement`), never edited or deleted after creation. Three types:

| Type | Written by | Quantity sign |
|---|---|---|
| `RESTOCK` | `createProduct` (initial stock > 0), `restockProduct` (manual), `receivePurchaseItems` (receiving a PO) | Positive |
| `SALE` | `deductStockInTransaction`, called from `sales.service.ts` when a sale is issued | Negative |
| `ADJUSTMENT` | Not currently written anywhere in the codebase — reserved for a future manual correction feature | Either |

`GET /inventory/products/:id/movements` returns a product's full movement history, newest first — this is the audit trail for "why is stock at this number."

## Low-Stock Detection

A product is "low stock" when `quantityInStock <= reorderLevel`. Two places compute this independently — keep them in sync if the definition ever changes:

1. `inventory.service.ts`'s `listProductsPaginated` (raw SQL filter, `stockFilter=low` query param) — see `../database/data-conventions.md` Rule 9 for why this one path uses raw SQL.
2. `reports.service.ts`'s `getInventoryReport` (`lowStockProducts`, in-memory filter after fetching all products).

## Cross-Module Dependency

`inventory.service.ts` exports `deductStockInTransaction(tx, productId, quantity, reason)` specifically for `sales.service.ts` to call inside its own `$transaction`, so a sale's status change and its stock deduction commit atomically — see `architecture/module-conventions.md`'s note on cross-module calls. Don't duplicate this logic inside `sales.service.ts`; import the function.

## Extending This Domain

- **A new stock-affecting operation** (e.g. a stock adjustment/write-off feature): add a new service function that writes both the `Product.quantityInStock` update and a `StockMovement` row (type `ADJUSTMENT`) inside one `$transaction`, mirroring `restockProduct`.
- **A new taxonomy level** (e.g. a third tier under Subcategory): follow the exact pattern `add_subcategory` used — a new Prisma model with a `@@unique([parentId, name])`, a delete-guard on its parent, and its own paginated list endpoint. See `../playbooks/add-a-new-module.md`.
