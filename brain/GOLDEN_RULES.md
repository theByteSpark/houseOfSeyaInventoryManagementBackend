# Golden Rules — How the Brain Is Written and Kept

> **Purpose:** This governs every file in `brain/` — the engineering knowledge base for this backend. It does not govern application code in `src/` or `prisma/`.
>
> **Read this before:** creating a new doc, editing an existing one, or deciding a doc needs to be split.

---

## 1. What This Document Is

A working contract between the humans and the agents who write in `brain/`. Not a style guide for its own sake — every rule here exists to prevent a specific failure mode: docs that drift from the real code, docs nobody can find, or docs so long nobody reads them before making a change.

---

## 2. Scope — What Counts as "The Brain"

The Brain is **how this system is built and why** — architecture decisions, module conventions, the database's real shape and relationships, and step-by-step recipes for extending it safely. It is written so a human can review a change before it happens, and so an agent can execute the same change without re-deriving the codebase's conventions from scratch every time.

**Inside the Brain:**
- Architecture and conventions (`architecture/`)
- The database schema and relationships (`database/`)
- Business rules per domain — inventory, sales, purchases (`domains/`)
- Step-by-step build recipes (`playbooks/`)
- Project orientation and local setup (`foundation/`)

**Not the Brain:**
- The code itself (`src/`, `prisma/schema.prisma`) — the Brain describes it, never replaces it. If a doc and the code disagree, the code is right and the doc is stale (see Rule 8).
- Business/product strategy, pricing, or sales process — this repo is the inventory/sales *system*, not the business judgment layer. That kind of brain, if this business ever needs one, is a separate concern.

---

## 3. Rule — Length

**Soft limit: ~250 lines per file.** This is a signal, not a wall.

If a file is short because the topic is genuinely small, leave it short. If a file is approaching or past 250 lines, that's a sign it covers more than one concern and should split along a real seam (e.g. "how sales work" vs "how purchases work"). Never split a doc that isn't done yet just to hit a number — incomplete stays one file until the missing pieces exist.

---

## 4. Rule — Instruction-Based and Sectioned

Every doc is something a reader *acts on*, not background reading. Prefer:

- Numbered steps or rules over prose paragraphs
- Tables over descriptive lists when there are 2+ comparable attributes (fields, statuses, endpoints)
- An explicit **Exit condition** for anything describing a process step or state transition
- Headers that let someone jump straight to the part they need

### Formatting: One Line Per Paragraph or List Item

Write each paragraph and list item as a single line in the source file — no manual mid-sentence line breaks. Markdown reflows regardless of source line breaks, so hard-wrapping only hurts the raw file. Split at real topic shifts into short paragraphs, not mid-thought.

---

## 5. Rule — Dual Audience (Human + Agent)

Every doc must work for both:

- **A human reviewing a change** — plain language, the "why" next to the "what," no unexplained jargon.
- **An agent executing against it** — unambiguous steps, exact file paths and function names, no rule that only makes sense with context a machine can't infer.

If a step reads clearly to a human but an agent would have to guess a file path or a naming convention, write the exact path or name instead of describing it.

---

## 6. Rule — Discoverability

Anyone — teammate or agent — should find what they need without being told where to look.

- Every doc states its purpose and related docs in the first 5 lines.
- `brain/README.md` is the single entry point and map. Adding, renaming, splitting, or retiring a doc updates the map in the same change.
- A file's name tells you what's in it without opening it — lowercase, hyphenated, descriptive (`module-conventions.md`, not `notes.md`).

---

## 7. Rule — Folder Structure: Domain Units

Organize by **domain**, not by date or author.

```
brain/
├── README.md                 entry point + map
├── GOLDEN_RULES.md            this file
├── foundation/                 what the service is, how to run it
├── architecture/                cross-cutting patterns every module follows
├── database/                     the schema, its relationships, its conventions
├── domains/                       business rules per feature area
└── playbooks/                       step-by-step build recipes
```

A new domain folder earns its existence once it has 2+ real files, or 1 file plus a named next one — not a guess that it might grow.

---

## 8. Rule — Keep In Sync With Code, or Flag It

This Brain describes a real, currently-running codebase, not a plan for one. That changes the failure mode from a sales brain (where the risk is fabricating settled facts) to this: **drift**. A doc that describes a module the way it worked three schema migrations ago is worse than no doc.

- Whenever a change touches a Prisma model, adds/removes a module, or changes a cross-cutting pattern (auth, pagination, error handling), update the relevant Brain doc in the *same* change — same commit or same PR, not "later."
- If you notice a doc that's already stale, fix it on the spot if it's small, or add a one-line `> **Drift note:**` under its purpose block naming exactly what's out of date, so the next person doesn't trust it blindly.
- `database/schema-overview.md` is the highest-risk file for drift — it's hand-written prose next to a machine-generated `schema.prisma`. Check it against `prisma/schema.prisma` whenever a migration lands.

---

## 9. Rule — No Filler

We are writing something that saves the next person (human or agent) from re-reading the whole codebase to make one change.

- Every paragraph answers a question someone would actually ask before touching this code.
- Cut anything that restates the title in different words.
- No decorative structure (emoji headers, ASCII banners, badges) — clarity and speed of scanning beat polish.

---

## 10. Rule — Reusable Recipe for a New Domain or Module

`domains/` and `playbooks/` are written to be domain-agnostic on purpose. Adding the equivalent brain coverage for a new business area (e.g. a future "returns" or "manufacturing" module) should take a short pass, not a redesign:

1. Build the module following `playbooks/add-a-new-module.md`.
2. Write its business-rule doc in `domains/<area>.md` using the same shape as `domains/sales-and-invoicing.md` (What it is → States/Rules table → Exit conditions → Related endpoints).
3. Add its Prisma models to `database/schema-overview.md`'s relationship map and table list.
4. Add it to `brain/README.md`'s map in the same change.

---

## 11. Before You Add or Edit a Doc — Checklist

1. Does this describe architecture/conventions/schema/business-rules, or is it product strategy that doesn't belong here? (Rule 2)
2. Is there already a doc this belongs in? Don't create a new file for one paragraph.
3. Purpose + related docs stated in the first 5 lines? (Rule 6)
4. Structured as steps/rules/tables, not narrative? (Rule 4)
5. Would a human and an agent both know exactly what to do after reading it? (Rule 5)
6. Under ~250 lines? If not, is there a real seam to split on? (Rule 3)
7. Does this change touch code? If so, is the matching Brain doc updated in the same change? (Rule 8)
8. Updated the map in `brain/README.md`?
