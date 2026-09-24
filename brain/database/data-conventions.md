# Data Conventions

> **Purpose:** The rules behind the schema's shape — why fields look the way they do, so a new model follows the same pattern.
>
> **Related docs:** `schema-overview.md` (what the rules produced) · `../architecture/module-conventions.md` (how services enforce these at the code level)

---

## 1. IDs Are UUID Strings

`id String @id @default(uuid())` on every model — never an auto-increment `Int`. Do this for a new model too. Reason: UUIDs are safe to generate client-side or in a transaction without a round-trip, and they don't leak "how many rows exist" the way sequential ints do (relevant here since `saleNumber`/`purchaseNumber` already carry the sequential-count information deliberately, in a human-facing format — see Rule 4).

## 2. Money Is `Decimal(10,2)`, Never `Float` — Physical Weights Are `Decimal(10,3)`

Every price/cost/total field is `Decimal @db.Decimal(10, 2)` in Prisma. Floats introduce rounding errors in financial math; `Decimal` doesn't. Two consequences to carry into new code:

- Prisma returns `Decimal` as a special object, not a plain number — every service's `toDto()` explicitly converts with `Number(field)` before the value reaches JSON. Forgetting this serializes an object, not a number, over the wire.
- All money math in services (line totals, subtotals, tax) is done on plain `number`s after conversion, then rounded explicitly: `Math.round(value * 100) / 100`. This happens *before* writing back to the DB, not relied on implicitly — see `sales.service.ts`'s `createSale` for the pattern.

Physical weight fields (`Product.grossWeight`, `ProductDiamond.caratWeight`, `ProductDiamond.weight`) use one more decimal place — `Decimal(10,3)` — introduced with the jewelry costing fields (migration `20260924120000`). Jewelry weights are routinely quoted to the milligram/point (e.g. `0.005`), where 2 decimals would silently round them. Keep this split for any new physical-quantity field: 3 decimals for a weight, 2 for anything that's actually currency.

## 3. Timestamps: `createdAt` Always, `updatedAt` Only When It Can Change

Every model has `createdAt DateTime @default(now())`. Models whose rows are ever mutated after creation (`User`, `Product`, `Sale`, `Vendor`, `Purchase`, `Customer`) also have `updatedAt DateTime @updatedAt`. Append-only/log-style models (`StockMovement`) and pure join records with no independent lifecycle (`SaleItem`, `PurchaseItem`) don't — there's nothing for "updated" to mean there.

## 4. Human-Facing Sequential Numbers Are a Separate Field From `id`

`Sale.saleNumber` and `Purchase.purchaseNumber` are computed as `` `SALE-${year}-${String(count + 1).padStart(4, '0')}` `` (see `nextSaleNumber()`/`nextPurchaseNumber()` in their respective services) — a year plus a zero-padded running count, unique and indexed, distinct from the UUID `id`. This exists because a UUID is not something a human reads on an invoice or types into a search box.

**Known limitation, worth knowing before extending this pattern:** the count comes from `prisma.sale.count()` at write time, not a DB sequence — under concurrent writes this has a narrow race window for a duplicate number. Acceptable at this system's current write volume; if a new module needs the same numbering pattern at higher concurrency, use a real Postgres sequence or an `@@unique` retry loop instead of copying this exactly.

## 5. Enums Model State Machines, Not Just Categories

`SaleStatus` and `PurchaseStatus` aren't arbitrary tags — they encode a linear (mostly) state machine that services enforce transitions on (see `domains/sales-and-invoicing.md` and `domains/purchases-and-vendors.md`). When adding a new stateful model, define the enum to match its real lifecycle, and write the transition-guard logic in the service the same way `transitionSale()` does — never let the frontend or an open PATCH set status to an arbitrary value.

## 6. Snapshotting vs. Live Reference

A `SaleItem`/`PurchaseItem` stores its own `unitPrice`/`unitCost` and `lineTotal` at creation time rather than always deriving from the current `Product.unitPrice`. This is deliberate: a sale from three months ago must keep showing what was actually charged, even if the product's price has since changed. When modeling a new "snapshot in time" relationship, copy this pattern (store the value at creation) rather than a live join that would silently rewrite history.

## 7. Cascade Behavior Is Manual, Not `onDelete: Cascade`

No relation in this schema uses Prisma's `onDelete: Cascade`. Deletion of a parent with dependents is blocked at the service layer with an explicit check and a `409`/`400` (`ApiError.conflict`/`badRequest`) — see `deleteCategory`, `deleteSubcategory`, `deleteVendor`. This is a deliberate choice: silent cascading deletes in an inventory/financial system are a data-loss risk; an explicit block forces a human decision (reassign products first, cancel/complete purchases first, etc.). Follow this for any new parent/child relationship — don't add `onDelete: Cascade` without discussing it first.

## 8. Migration Naming

`prisma migrate dev` auto-prefixes a timestamp; the name you give it should describe the *change*, not the *table* — compare `add_subcategory` (what changed) to a hypothetical `subcategory_table` (redundant with the fact it's a migration). Past examples in this repo: `rename_invoice_to_sale`, `add_password_reset_token`, `add_vendor_purchase_models`. Keep using snake_case, verb-first where it reads naturally (`add_`, `rename_`).

## 9. Raw SQL Is an Escape Hatch, Not the Default

`inventory.service.ts`'s `listProductsPaginated` uses `prisma.$queryRaw` once, to filter by a computed condition (`quantityInStock <= reorderLevel`) that Prisma's query builder can't express directly as a `where` filter across two columns of the same row without it. This is the only raw-SQL call in the codebase — reach for it only when the same wall is hit (a same-row column-to-column comparison), and keep the query narrowly scoped (selecting just `id`, then filtering by `id IN (...)` in a normal Prisma query) rather than raw-querying the full row.

## 10. A Picklist Value Is Stored as a Plain String, Not a Foreign Key

`AttributeOption` (Metal Type, Diamond Shape, Diamond Quality) backs a dropdown that's expected to change over time — options get added, and an admin can remove one that's no longer used. `Product.metalType` and `ProductDiamond.shape`/`quality` store the chosen **label string directly** at entry time, with no FK into `AttributeOption`. This means deleting an `AttributeOption` row is always non-destructive: it only removes that choice from the picker for new entries, it can never orphan a historical product or require a cascade decision. Use this pattern — a plain string column populated from a small managed list, no FK — for any future field that's a "growing/shrinking tag," as opposed to a real entity with its own identity and relationships (a `Category`/`Subcategory`, by contrast, *is* a real entity — products can be reassigned, categories carry a delete-guard, and Rule 7's manual-cascade rule applies to them, not this pattern).
