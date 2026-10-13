# Domain: Enquiries

> **Purpose:** What an Enquiry is, why it deliberately has no pricing, and the rules around it — module: `src/modules/enquiries/`.
>
> **Related docs:** `../database/schema-overview.md` (`Enquiry`/`EnquiryDiamond` tables) · `inventory-and-stock.md` (the costed sibling domain — `Product`) · `../architecture/module-conventions.md` (the code shape)

---

## What This Is

A record of what a customer is asking about — before any `Product` exists for it, and before there's a real purchase committed to sourcing it. A walk-in customer describing "gold, this subcategory, about this weight, with these kinds of diamonds, roughly this selling amount, and here's what they said about the custom order" gets an `Enquiry` row, not a costed `Product`. There's no backend link between an Enquiry and the `Product`/`Purchase` it might become — if staff decide to actually source and cost that design, the frontend's **"Convert to Purchase Order"** action pre-fills a new `PurchaseEnquiry` with this Enquiry's subcategory/metal/diamond detail (no backend change, pure client-side form-to-form handoff — see `houseOfSeyaInventoryManagement`'s `EnquiriesListPage.tsx`/`DashboardPage.tsx`), but nothing is stored connecting the two records.

## Fields, By Design

| Field | Present? | Why |
|---|---|---|
| Customer | Yes, required | Who's asking |
| Subcategory | Yes, optional | What kind of piece — optional because a customer can be vague |
| Metal type | Yes, required | From the same `AttributeOption` (`type: METAL`) picklist the product form uses |
| Gross weight | Yes, required | Roughly how heavy |
| Diamond shape/quality/pieces/carat weight | Yes, **one block, not repeatable** | Flattened onto the `Enquiry` row itself, same as `Product`'s diamond fields — a design has exactly one diamond block (see `../database/data-conventions.md` Rule 11) |
| Selling amount | Yes, required | The amount expected to be quoted — captured at registration time so it shows on the Dashboard without waiting for a real `Product`/`Sale` to exist |
| Notes | Yes, optional, free text | Anything the client said about a custom order that doesn't fit the structured fields above |
| Diamond `weight` (reference) / `rate` / computed cost | **No** | These exist on `Product`'s diamond fields because that model is being costed. Nothing here is priced beyond the one `sellingAmount` figure. |
| Metal rate / making charge / fixed expense | **No** | Same reason — an Enquiry is pre-costing. |
| Status / lifecycle | **No, not yet** | Only plain CRUD today (list/create/edit/delete). A status (open/converted/closed) or an explicit link to the `Product`/`PurchaseEnquiry` it turned into is a reasonable future addition but wasn't asked for — see `../GOLDEN_RULES.md` Rule 10 before adding one speculatively. |

## Rules

| Rule | Enforced in |
|---|---|
| Customer must exist | `createEnquiry`/`updateEnquiry` — `ApiError.notFound` if not |
| Subcategory, if given, must exist | Same functions — checked only when `subcategoryId` is non-empty |
| Create/update/list/view need only `authenticate` | Recording an enquiry is normal staff work, same permission level as creating a `Customer` or a `Sale` |
| Delete is admin-only | `DELETE /enquiries/:id` carries `authorize('ADMIN')` — deleting a record is treated like cancelling a Sale/Purchase, not like normal data entry |

## Extending This Domain

- **Linking an Enquiry to the Product/PurchaseEnquiry it became**: add a nullable FK — set it at the point staff create the matching record, or when "Convert to Purchase Order" actually submits (today it only pre-fills a form, it doesn't persist a link). Don't build this speculatively until it's actually asked for.
- **A status/lifecycle**: if added, follow the same enum-as-state-machine pattern `SaleStatus`/`PurchaseStatus` already establish (`../database/data-conventions.md` Rule 5) rather than inventing a different shape.
