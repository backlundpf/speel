# Documentation System — Meta-doc

**Spec:** `docs/superpowers/specs/2026-06-10-documentation-design.md`

## Purpose

This file is the authority for how consumer documentation is written, organized, and kept honest
in the speel monorepo. Consumer docs target developers and coding agents in a consumer SPFx
project — people with `@speel/*` installed who want to use the packages idiomatically.

The docs ship inside the npm tarballs so agents find them in `node_modules/@speel/*` without
network access. Each README's annotated TOC routes a reader to exactly one topic page, at a
budget that fits alongside an actual task in context.

## Where Docs Live

Each package has a `docs/` folder plus a landing-page `README.md`. The layout for all five
packages:

```
packages/speel-core/
  README.md            # pitch, install, ~20-line quickstart, conventions, annotated TOC
  docs/
    modeling.md        # ModelBuilder, entity/property/field configs, validations
    querying.md        # filter builder, operators, ordering, paging, asNoTracking
    saving.md          # change tracking, add/update/delete, saveChangesAsync
    relationships.md   # navs, FK inference, fixup, inverse collections, loading
    forms.md           # form-state surface: field state, options, validation
    permissions.md     # PermissionsBuilder, RoleAssignments, principals
    caching.md         # list caching + incremental sync
    providers.md       # provider abstraction

packages/speel-pnpjs/
  README.md
  docs/                # useSharePoint, schema provider, folder placement, person-field quirks, OData behavior, getSPFI

packages/speel-migrations/
  README.md
  docs/                # concepts, authoring migrations, runtime application

packages/speel-migrations-cli/
  README.md            # small enough to stay a single file

packages/speel-react/
  README.md
  docs/
    setup.md           # SpeelProvider, SpeelConfiguration, layers, fluent-v8 skin
    forms.md           # useEntityForm, SpeelForm, SpeelField/EntityFields
    tables.md          # SpeelTable vs SpeelEntityTable, columns, sort/filter, reload handle
    surfaces.md        # SpeelModal/SpeelPanel, useSurfaces/useOverlays, disclosure
    feedback.md        # toasts, notifications, active tasks
    migrations-ui.md   # migrations admin surface
```

Topic names are feature-area-stable — a relationships feature always lands in `relationships.md`.
The lists above are the starting set; the pipeline may add pages and update TOCs.

## Topic Page Skeleton

Every topic page has exactly four H2 sections, in this order:

1. **`## What & when`** — 2–3 sentences: what this capability is, when to reach for it.
2. **`## Canonical example`** — one complete, copy-pasteable snippet (imports included), 80% case.
3. **`## Capabilities`** — feature surface in prose/fragments by intent. Never a method inventory.
4. **`## Boundaries & gotchas`** — intentional non-goals, sharp edges, EF Core deltas.

Target: 100–250 lines per page.

### Altitude: good example

> To make a field conditionally required, pass a predicate to `isRequired`:
>
> ```ts
> b.property((e) => e.ApprovedBy)
>   .isText()
>   .isRequired((ctx) => ctx.values.Status === "Approved");
> ```
>
> The predicate receives a context whose `values` is the entity snapshot, so any field can gate any other.

This documents a _capability and idiom_ — names the method once, in context, explains intent.

### Altitude: bad example

> #### `isRequired` overloads
>
> | Signature                        | Description                 |
> | -------------------------------- | --------------------------- |
> | `isRequired()`                   | Always required             |
> | `isRequired(predicate, message)` | Dynamic with custom message |

This is a signature inventory: couples docs to the exact overload set, no guidance on _when_ or
_why_. This pattern is prohibited.

## README Shape

Each README is a landing page, not a manual. Five parts:

1. **Pitch** — one paragraph: what the package is, one sentence on how it relates to siblings.
2. **Install** — the install line(s), including required peers.
3. **Quickstart** — ~20 lines, complete and runnable.
4. **Conventions** — mental model: EF Core carry-overs and deliberate divergences; import paths;
   the two or three idioms agents most often get wrong.
5. **Annotated TOC** — `- [Title](docs/file.md) — read when <doing X>.` per page (`llms.txt`-style
   routing without a separate file). End with `## Reference app` → `../../samples/spfx-sample`.

## The Document Pipeline Step

The feature workflow is **brainstorm → plan → implement → document → squash-merge**. A feature
branch may contain several spec/plan cycles; the document step runs **once per feature branch,
as its final task before the squash merge** — that is when the API is stable. Don't update docs
after each spec; document the branch's settled surface in one pass, committed on the branch so
the squash lands code and docs atomically. The same goes for spec and plan documents: commit
them on the feature branch, never directly on main — they land inside the squash commit. Four
actions:

1. **Identify** which topic page(s) the branch's changes touch (across all its specs).
2. **Update** Capabilities. Update the canonical example only if the 80% case changed.
3. **Re-verify** each touched page's canonical example against `src/index.ts` exports. Read the
   exports; never rely on memory. This is the guard against silent rot.
4. **Add a TOC line** to the README if a new page was added.

## Honesty Rule

No snippet compile gate before 1.0 — it would make every refactor fight the docs, exactly the
inertia this system avoids while the API is settling. Re-verification (action 3) is manual and
mandatory at every document step; the compile gate is on the **public-launch checklist**.

Anything in flux is documented one altitude higher or carries `> Stability: still settling.`
Silent omission is not acceptable.
