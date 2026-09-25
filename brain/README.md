# House of Seya — Backend Brain

> **Purpose:** Entry point to this repo's engineering knowledge base. Read this first — human or agent — before changing architecture, the schema, or adding a module.
>
> **How the Brain is written and organized:** `GOLDEN_RULES.md`. Every doc in `brain/` — new or edited — answers to that file.

## What This Repo Is

An Express + TypeScript + Prisma (PostgreSQL) REST API for House of Seya's inventory, sales, and purchasing operations. It serves the frontend in the sibling repo `houseOfSeyaInventoryManagement`. If you're asking "how do I run this" or "what does module X do," this Brain is the shortcut. The code in `src/` and `prisma/` is always the final source of truth — see `GOLDEN_RULES.md` Rule 8 on drift.

## Where to Start, By Task

| I want to... | Read |
|---|---|
| Understand the overall architecture and request lifecycle | `foundation/overview.md` |
| Run this locally, set env vars, seed the DB | `foundation/setup.md` |
| Understand the routes → controller → service → validation shape every module follows | `architecture/module-conventions.md` |
| Understand pagination, sorting, search, and error responses | `architecture/error-handling-and-pagination.md` |
| Understand login, JWT, refresh tokens, and role checks | `architecture/auth-and-authorization.md` |
| See how every table relates to every other table | `database/schema-overview.md` |
| Understand ID/money/timestamp conventions in the schema | `database/data-conventions.md` |
| Understand product/category/stock-movement rules, the jewelry costing formulas, and the attribute-options picklists | `domains/inventory-and-stock.md` |
| Understand what an Enquiry is and why it has no pricing | `domains/enquiries.md` |
| Understand the Sale lifecycle and invoicing | `domains/sales-and-invoicing.md` |
| Understand the Purchase lifecycle and receiving stock | `domains/purchases-and-vendors.md` |
| **Build a brand-new CRUD module end to end** | `playbooks/add-a-new-module.md` |

## The Map

| Doc | Answers |
|---|---|
| `GOLDEN_RULES.md` | How every Brain doc must be written, sized, and kept in sync with code |
| `foundation/overview.md` | Stack, folder layout, request lifecycle, how modules plug into `app.ts` |
| `foundation/setup.md` | Env vars, `npm run dev`, Prisma migrate/generate/seed, deployment notes |
| `architecture/module-conventions.md` | The `routes → controller → service → validation` shape, naming, DTO-mapping pattern |
| `architecture/error-handling-and-pagination.md` | `ApiError`, `asyncHandler`, the shared pagination/sort/search contract |
| `architecture/auth-and-authorization.md` | Access/refresh JWT flow, `authenticate`/`authorize` middleware, roles |
| `database/schema-overview.md` | Every model, every relationship, an ER-style map of the whole DB |
| `database/data-conventions.md` | UUID ids, `Decimal` money, enum-as-state-machine pattern, migration naming |
| `domains/inventory-and-stock.md` | Category → Subcategory → Product, `StockMovement`, reorder levels, the jewelry costing formulas, and the attribute-options module |
| `domains/sales-and-invoicing.md` | `Sale` state machine, numbering, stock deduction on issue, PDF invoice |
| `domains/purchases-and-vendors.md` | `Purchase` state machine, partial receiving, vendor stats, vendor invoice fields, and how purchases create new products |
| `domains/enquiries.md` | `Enquiry`/`EnquiryDiamond` — recorded customer interest, deliberately with no pricing |
| `playbooks/add-a-new-module.md` | The exact steps to add a new resource: schema → migration → service → routes → wire into `app.ts` → frontend hookup pointer |

## Where We Stand

**Current situation:** The API covers auth, users, customers, inventory (categories/subcategories/products-as-jewelry-cost-sheets/stock movements), sales, vendors, purchases, reports, attribute options (the Metal/Diamond-Shape/Diamond-Quality picklists), and enquiries (pricing-free customer interest records). One Postgres database via Prisma, one Express app, JWT access + refresh-token auth with two roles (`ADMIN`, `STAFF`). This Brain was written by walking the actual code in `src/` and `prisma/schema.prisma` as of the migration `20260925180000_flatten_product_diamond` — see `database/schema-overview.md` for the exact model list this reflects.

**Near-term ask:** Use this Brain when reviewing or extending the system — especially `playbooks/add-a-new-module.md` for new resources and `database/schema-overview.md` before any schema change, so new work matches existing conventions instead of introducing a second pattern.

**Long-term goal:** Let anyone — a new contributor or an agent picking this up cold — understand the system's shape and safely extend it without reverse-engineering it from scratch each time, and keep that understanding accurate as the system grows (`GOLDEN_RULES.md` Rule 8).
