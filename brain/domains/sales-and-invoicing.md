# Domain: Sales & Invoicing

> **Purpose:** The `Sale` lifecycle, numbering, and how issuing a sale ties into stock — the rules a new sales-related feature has to respect.
>
> **Related docs:** `../database/schema-overview.md` (`Sale`/`SaleItem` tables) · `inventory-and-stock.md` (the stock side of issuing) · module: `src/modules/sales/`

---

## State Machine

```
DRAFT --issue--> ISSUED --markPaid--> PAID
  |                 |
  +--cancel-------->+--cancel--> CANCELLED
```

| Status | Meaning | Can transition to |
|---|---|---|
| `DRAFT` | Being built, editable, stock not yet touched | `ISSUED` (via issue), `CANCELLED` |
| `ISSUED` | Finalized, stock deducted, invoice can be generated | `PAID`, `CANCELLED` |
| `PAID` | Payment received | *(terminal — cannot be cancelled, see below)* |
| `CANCELLED` | Voided | *(terminal)* |

Enforced in `transitionSale()` (`sales.service.ts`):

| Rule | Guard |
|---|---|
| Only a `DRAFT` sale can be issued | `if (sale.status !== 'DRAFT') throw ApiError.badRequest('Only draft sales can be issued.')` |
| Only an `ISSUED` sale can be marked paid | `if (status === 'PAID' && sale.status !== 'ISSUED') throw ...` |
| A `PAID` sale can never be cancelled | `if (status === 'CANCELLED' && sale.status === 'PAID') throw ...` |
| Only a `DRAFT` sale can be edited (items/customer changed) | Checked in `updateSale()` before touching items |

## Creating a Sale

`createSale(input)`:
1. Validates the customer exists.
2. Loads all referenced products in one query (`findMany({ where: { id: { in: productIds } } })`), builds a `Map` for O(1) lookup per line — not one query per line item.
3. Computes each line's `lineTotal = unitPrice * quantity`, rounded to cents; sums to `subtotal`.
4. Applies a flat 3% (`TAX_RATE` constant in `sales.service.ts`, not client-overridable — the earlier version accepted an optional per-sale `taxRate` input defaulting to 10%; that override was removed once the business settled on a fixed rate) to get `tax`, then `total = subtotal + tax`.
5. Generates `saleNumber` via `nextSaleNumber()` (see `../database/data-conventions.md` Rule 4 for its format and known race-window limitation).
6. Creates the `Sale` with status `DRAFT` and nested `items: { create: itemsData }` in one Prisma call.

**Note:** stock is *not* touched at creation — only at issue. A `DRAFT` sale reserves nothing.

## Issuing a Sale (Where Stock Actually Moves)

`transitionSale(id, 'ISSUED')`:
1. Re-fetches the sale with its items and re-checks every line against **current** `quantityInStock`, throwing `ApiError.badRequest` naming the specific product if insufficient — this check happens even though the sale was created earlier, because stock may have moved since.
2. Inside one `$transaction` (15s timeout): for every item, calls `deductStockInTransaction(tx, productId, quantity, 'Sale ' + saleNumber)` (from `inventory.service.ts`) and updates `Sale.status` → `ISSUED` with `issuedAt = now()`.
3. If any deduction would fail, the whole transaction rolls back — a sale is never left half-deducted.

## Customer Deletion

`deleteCustomer` (`customers.service.ts`) blocks deletion with `ApiError.badRequest('Cannot delete a customer that has sales or enquiries.')` if the customer has any `Sale` (any status) or any `Enquiry` — checked via `_count: { select: { sales: true, enquiries: true } }` on one query. Same "never silently orphan history" reasoning as the product/category/subcategory delete guards in `inventory-and-stock.md`.

## Invoicing (PDF)

`sales.pdf.ts` generates a PDF invoice from `getSaleForInvoice(id)` — the raw Prisma result (not the flattened DTO), since the PDF layout needs the full nested customer/item/product data. Invoice generation reads data; it never mutates sale status.

## Reporting

`reports.service.ts`'s `getSalesReport(from, to, status)` aggregates by date range and status: total count/revenue/tax, a status breakdown (`groupBy`), and top-10 products by quantity sold (`saleItem.groupBy`). This is read-only and has no bearing on the state machine above.

## Extending This Domain

- **A new terminal status** (e.g. a `REFUNDED` state): add it to the `SaleStatus` enum (new migration), add its transition guard to `transitionSale()` following the existing `if` pattern, and decide whether it reverses the stock deduction (if so, write a new `StockMovement` with positive quantity and type `ADJUSTMENT` or a new type — see `inventory-and-stock.md`).
- **A new numbering scheme need** (e.g. per-vendor invoice numbers): don't copy `nextSaleNumber()`'s count-based approach if concurrency matters more than it does today — see `../database/data-conventions.md` Rule 4.
