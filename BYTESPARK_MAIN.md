# ByteSpark Main — Feature Catalog & Branch Policy

> **What this is:** the canonical, always-up-to-date feature branch for ByteSpark's inventory/sales/purchasing platform. Use it as a sales demo, a client walkthrough, and the starting point for every new client branch. Present on both repos — `houseOfSeyaInventoryManagement` (frontend) and `houseOfSeyaInventoryManagementBackend` (backend).

## Branch policy (the golden rule)

1. **`bytespark-main` is the superset.** Any feature built on any client branch — whether it started life on `house_of_seya`, a future client branch, or here directly — gets propagated to `bytespark-main` too, in the same change or shortly after. This branch should never be missing a feature another branch has.
2. **Client branches never get features pushed back from `bytespark-main` automatically.** A new client branches off `bytespark-main` and then adds or removes features for that client's needs — changes flow from client branches *into* `bytespark-main`, not the other way.
3. **Starting a new client:** `git checkout -b <client-name> bytespark-main` on both repos, then add/remove modules per that client's contract. Don't branch a new client off an existing client's branch (e.g. off `house_of_seya` or `paragon-resin-main` directly) — always fork from `bytespark-main` so the client starts from the full catalog, not whatever one other client happened to need.
4. **Keep this file in sync.** Whenever a feature lands here that isn't already described below, add it to the catalog in the same change.

## Where this branch started

Created from `house_of_seya` (identical to `sam_dev` at the time of creation) — every feature below was built there across this engagement. `house_of_seya`, `sam_dev`, and the other client branches (`paragon-resin`, `paragon-resin-main`) are untouched by this — `bytespark-main` is a new, independent branch.

## Feature Catalog

### Enquiries (customer interest, pre-sale)
- Record a customer enquiry: customer, subcategory, metal type, gross weight, a single diamond (shape/quality/pieces/carat weight), and the expected selling amount.
- Edit or delete any enquiry (delete is admin-only).
- **Convert to Purchase Order** — jumps straight into a pre-filled Purchase Order (subcategory/metal/diamond carried over) when the item needs sourcing from a vendor.

### Purchase Order (vendor-side interest, pre-purchase)
- Record what you're asking a vendor about before committing to an actual purchase — vendor, subcategory, metal, diamond detail.
- Edit or delete any purchase order (delete is admin-only).
- **Convert to Purchase** — jumps straight into Add Purchase with the vendor and cost-sheet detail already filled in.

### Purchases
- Add a purchase and build the new product's full jewelry cost sheet right there (metal, diamond, making charge, other cost, selling price) — each purchase line is a brand-new, one-of-a-kind product.
- Commits straight to **Received** on save — stock and product status update immediately, no separate "mark as ordered" or "mark as received" step for a normal purchase.
- **Editable even after Received**, to fix a mistaken entry — removing a line deletes that product from Inventory entirely (blocked if it's already been sold), adding a line receives it immediately too.
- **Admin-only Cancel**, usable even on a Received purchase — deletes every product it created from Inventory (blocked if any of them has already been sold).
- Items column visible directly on the Purchases list — no need to open each record to see what's in it.
- Vendor invoice number and date captured per purchase.
- A legacy one-click "Mark as received" action still exists for any older Ordered purchase.

### Sales
- Add a sale for a customer with one or more products, plus the amount received — **required**, every sale collects at least a full payment or a custom-order advance, never nothing.
- Commits immediately to **Partially Paid** or **Paid** depending on what's collected — stock is deducted and the product marked Sold right away.
- A product can be billed even while it's still **Ordered** (on its way from a vendor, not yet received) — a backorder sale, clearly flagged in the UI. It stays Sold when its purchase eventually arrives instead of becoming available again.
- Inclusive 3% tax (reported, never added on top of the price) and an optional discount (percent or fixed amount).
- **Editable at any payment stage**, to record more payment or fix a mistake — line changes reconcile stock/product status correctly depending on whether each item was ever actually received.
- **Admin-only Cancel**, usable even on a Paid sale — reverses every item to Active+stock (or back to Ordered, if it was sold while still on backorder).
- The downloadable PDF is a **Credit Note** until the balance is fully settled, then becomes the **Tax Invoice** once Paid, dated by the actual payment date.
- Full product cost-sheet detail shown on the Sale/Purchase detail pages, not just while editing.

### Inventory
- Every product is a full jewelry cost sheet: metal, diamond, making charge, other cost, computed selling price.
- Product status lifecycle — **Ordered** (on a purchase, not yet received) → **Active** (in stock, sellable) → **Sold** — updates automatically as purchases are received and sales are recorded.
- Filter the list by subcategory or status.
- Bulk import/export via CSV/Excel.

### Dashboard
- Four sections — Enquiries and Sales on the left, Purchase Order and Purchases on the right — each showing the last 10 records with an Add button and a View all link.
- Click any Sale or Purchase row to open it; every section's actions match what's available on its own list page.

### Reports
- Sales and Purchases tabs: totals, status breakdown, top products, filterable by date range and status (including Partially Paid).
- Inventory tab: stock value, low-stock items, recent stock movements.

### Attribute Options (admin)
- Manage the Metal Type, Diamond Shape, and Diamond Quality picklists — add, **edit**, or remove options.
- Renaming an option cascades the new name to every existing Product, Enquiry, and Purchase Order that already used it.

### Access & Roles
- Two roles — Admin and Staff. Admin-only: Users management, Attribute Options, cancelling a Sale/Purchase, deleting an Enquiry/Purchase Order.
- JWT access + refresh token auth.

### In-App Help
- Role-aware Help & Guide page (accordion UI) covering every module — kept in sync with the feature set above.

### Platform
- Route-level code-splitting (every page lazy-loaded) to keep the initial bundle small.
- `brain/` engineering knowledge base (architecture, schema, domain rules, playbooks) for onboarding new contributors or agents without re-deriving conventions from scratch.

## Known gaps — not yet in this branch

Features that exist on `paragon-resin-main`/`paragon-resin` but have **not** been ported here, because they rewrite the same core files (`inventory`, `sales`, `purchases`, `reports`, `users`) around a different data model than the one-of-a-kind product/status lifecycle above. Porting each one is real design work, not a mechanical merge — scope out as its own phase before starting:

- **Warehouses** — multi-warehouse inventory scoping.
- **Stock transfers** — moving stock between warehouses.
- **Stock conversions** — converting stock between units/forms.
- **Blocked-quantity tracking** — reserving stock against a pending commitment.
- **Real-time notifications** — WebSocket-based live updates.

Also not yet ported: `paragon-resin-main`'s realigned CSV import column conventions and its demo-data cleanup script — both minor, worth revisiting once the above is scoped.
