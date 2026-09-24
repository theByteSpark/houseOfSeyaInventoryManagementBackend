# Domain: Purchases & Vendors

> **Purpose:** The `Purchase` lifecycle, partial receiving, and how vendor stats are derived — the rules a new purchasing feature has to respect.
>
> **Related docs:** `../database/schema-overview.md` (`Vendor`/`Purchase`/`PurchaseItem` tables) · `inventory-and-stock.md` (stock side of receiving) · module: `src/modules/purchases/`, `src/modules/vendors/`

---

## State Machine

```
DRAFT --order--> ORDERED --receive (partial)--> PARTIALLY_RECEIVED --receive (rest)--> RECEIVED
  |                  |                                    |
  +--cancel--------->+--cancel--------------------------->+  (no cancel once RECEIVED)
```

| Status | Meaning | Can transition to |
|---|---|---|
| `DRAFT` | Being built, editable | `ORDERED` (via order), `CANCELLED` |
| `ORDERED` | Sent to vendor, awaiting delivery | `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED` |
| `PARTIALLY_RECEIVED` | Some line items fully/partly delivered, others not | `PARTIALLY_RECEIVED` (more received), `RECEIVED`, `CANCELLED` |
| `RECEIVED` | Every line item's `receivedQuantity >= quantity` | *(terminal — cannot be cancelled)* |
| `CANCELLED` | Voided | *(terminal)* |

Enforced in `purchases.service.ts`:

| Rule | Guard |
|---|---|
| Only `DRAFT` can be edited | `updatePurchase`: `if (existing.status !== 'DRAFT') throw ...` |
| Only `DRAFT` can be ordered | `orderPurchase`: `if (purchase.status !== 'DRAFT') throw ...` |
| Only `ORDERED` or `PARTIALLY_RECEIVED` can receive items | `receivePurchaseItems` |
| A `RECEIVED` purchase can never be cancelled | `cancelPurchase`: `if (purchase.status === 'RECEIVED') throw ...` |
| Already-`CANCELLED` can't be cancelled again | Same function, explicit check |

## Creating a Purchase

`createPurchase(input)` mirrors `createSale`'s shape: validates the vendor, batch-loads referenced products, computes `lineTotal = unitCost * quantity` per line, sets every `receivedQuantity` to `0`, generates `purchaseNumber` via `nextPurchaseNumber()` (same format/limitation as sale numbers — see `../database/data-conventions.md` Rule 4). **Difference from `Sale`:** `Purchase` has no stored `subtotal`/`total` column — `toDto()` computes it from `items` at read time every time (`purchases.service.ts`'s `toDto`). If a future change needs to freeze a purchase's total independent of its items (e.g. after a price dispute), that's a schema change, not a code-only fix.

`vendorInvoiceNumber`/`vendorInvoiceDate` (added in migration `20260925090000`) are plain optional fields on the same input — no validation beyond "well-formed date string," since a `DRAFT` purchase may exist before the vendor's paperwork does.

## Purchases Are How New Designs Enter the Catalog

Since the jewelry-costing rework (`brain/domains/inventory-and-stock.md`), the frontend's purchase form creates a **brand-new `Product`** for every line item — there's no "pick an existing product" step on that screen anymore (a frontend-only decision; this module's API is unchanged, it's just called the same way `ProductFormPage` already calls `POST /inventory/products`, once per line, before the purchase itself is saved). Each new product is created with `quantityInStock: 0` — stock only becomes real once this purchase is received via `receivePurchaseItems` below. If a line is later removed from the purchase draft before saving, the product it already created stays in the catalog with 0 stock; that's expected, not a bug (same as an unused customer/vendor created via a form's inline "add new" flow).

## Receiving Items (Where Stock Actually Moves)

`receivePurchaseItems(id, input)` — the most complex operation in this domain:

1. Validates the purchase is `ORDERED` or `PARTIALLY_RECEIVED`.
2. For each line in the request: looks up the matching `PurchaseItem` by `productId`, computes `remaining = quantity - receivedQuantity`, rejects a negative `receivedQty` or one exceeding `remaining`.
3. Inside one `$transaction` (15s timeout): for every accepted line, increments `PurchaseItem.receivedQuantity`, increments `Product.quantityInStock`, and writes a `StockMovement` (`type: RESTOCK`, `reason: 'PO ' + purchaseNumber`).
4. After all lines are applied, re-checks **every** item on the purchase (not just the ones just received) — if `receivedQuantity >= quantity` for all of them, status becomes `RECEIVED` (`receivedAt = now()`); otherwise `PARTIALLY_RECEIVED`.

This means receiving can be called multiple times against the same purchase (multiple partial deliveries), and the status is recomputed from the full item set each time rather than incremented — safer against double-counting.

## Vendor Stats Are Derived, Not Stored

`vendors.service.ts`'s `toDto()` computes `totalOrders`, `lastOrderedDate`, `lastOrderedProduct`, `lastOrderedQty` from the vendor's `purchases` relation at read time (filtered to purchases with a non-null `orderedAt`, sorted newest-first, first item of the most recent purchase). No columns on `Vendor` cache these — if vendor list performance ever becomes an issue at scale, this is the first place to look (a materialized/cached summary), not before.

## Extending This Domain

- **A new receiving constraint** (e.g. requiring a quality-check step before `RECEIVED`): add the check inside `receivePurchaseItems` before the transaction, following the existing `remaining`/`receivedQty` validation shape.
- **Storing a frozen purchase total**: add `subtotal`/`total` `Decimal` columns to `Purchase` (migration), set them once at `RECEIVED` or `ORDERED` transition, and update `toDto()` to prefer the stored value over the computed one — don't silently change what `toDto()` returns without deciding which state freezes it.
