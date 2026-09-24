# Domain: Enquiries

> **Purpose:** What an Enquiry is, why it deliberately has no pricing, and the rules around it — module: `src/modules/enquiries/`.
>
> **Related docs:** `../database/schema-overview.md` (`Enquiry`/`EnquiryDiamond` tables) · `inventory-and-stock.md` (the costed sibling domain — `Product`/`ProductDiamond`) · `../architecture/module-conventions.md` (the code shape)

---

## What This Is

A record of what a customer is asking about — before any `Product` exists for it, and before there's any price to quote. A walk-in customer describing "gold, this subcategory, about this weight, with these kinds of diamonds" gets an `Enquiry` row, not a costed `Product`. There is **no automatic conversion** from an Enquiry into a Product or a Sale — if staff decide to actually build and cost that design, they create a real `Product` by hand via the inventory module; the Enquiry just stays as a record of the ask.

## Fields, By Design

| Field | Present? | Why |
|---|---|---|
| Customer | Yes, required | Who's asking |
| Subcategory | Yes, optional | What kind of piece — optional because a customer can be vague |
| Metal type | Yes, required | From the same `AttributeOption` (`type: METAL`) picklist the product form uses |
| Gross weight | Yes, required | Roughly how heavy |
| Diamond shape/quality/pieces/carat weight | Yes, repeatable (0+) | What kind of stones, if any |
| Diamond `weight` (reference) / `rate` / computed `amount` | **No** | These exist on `ProductDiamond` because that model is being costed. Nothing here is priced, so there's nothing to compute. |
| Metal rate / making charge / fixed expense / selling price | **No** | Same reason — an Enquiry is pre-costing. |
| Status / lifecycle | **No, not yet** | Only plain CRUD today (list/create/edit/delete). A status (open/converted/closed) or an explicit link to the `Product` it turned into is a reasonable future addition but wasn't asked for — see `../GOLDEN_RULES.md` Rule 10 before adding one speculatively. |

## Rules

| Rule | Enforced in |
|---|---|
| Customer must exist | `createEnquiry`/`updateEnquiry` — `ApiError.notFound` if not |
| Subcategory, if given, must exist | Same functions — checked only when `subcategoryId` is non-empty |
| No `authorize()` gate | Recording an enquiry is normal staff work, same permission level as creating a `Customer` or a `Sale` — every route only requires `authenticate` |
| Diamonds replaced wholesale on update | `updateEnquiry`: `deleteMany` + nested `create` in one `$transaction`, identical pattern to `ProductDiamond`/`SaleItem` |

## Extending This Domain

- **Linking an Enquiry to the Product it became**: add a nullable `convertedProductId` FK on `Enquiry` (or the reverse, depending on which side should own the pointer), set it at the point staff create the matching `Product` — don't build this speculatively until it's actually asked for.
- **A status/lifecycle**: if added, follow the same enum-as-state-machine pattern `SaleStatus`/`PurchaseStatus` already establish (`../database/data-conventions.md` Rule 5) rather than inventing a different shape.
