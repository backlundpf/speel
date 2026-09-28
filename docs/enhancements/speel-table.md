# SpeelTable — enhancement backlog

Gaps found while building real surfaces on `SpeelTable` / `SpeelEntityTable`. This is a
backlog, not a design: each entry records what was wanted, what the component does today,
and what the caller had to do instead. Consumer documentation lives in
[packages/speel-react/docs/tables.md](../../packages/speel-react/docs/tables.md).

## Initial filter state

`SpeelTableProps` exposes `defaultSort` but nothing for filters — `filters` initializes to
`{}` (`SpeelTable.tsx`). A surface that should open pre-filtered (a dashboard defaulting to
"pending" rows, say) cannot express that.

Workaround: filter the `items` array before passing it, and give the user a separate control
to widen the set. That works, but it puts two filtering mechanisms on one table — the
caller's and the component's — and the caller's does not appear in the table's own filter UI.

Wanted: a `defaultFilters` prop mirroring `defaultSort`, seeding the same `FilterState` the
header controls write to, so a pre-applied filter is visible and clearable where the user
expects it.

**Resolved 2026-08-04.** `defaultFilters` ships as described. It seeds once, and an unknown
key, a criteria kind the column cannot interpret, or pairing it with `filterable={false}`
throws at mount rather than leaving the table looking unfiltered. `FilterCriteria` is public
now — the type views will serialise. Documented in
[tables.md](../../packages/speel-react/docs/tables.md).

## Row-level styling

There is no `rowClassName` / `getRowProps` hook, so a row cannot be styled from a predicate
(overdue red, pending highlighted, archived muted). The legacy tables being migrated all do
this and it reads well — the eye finds the actionable rows before it reads any text.

Workaround: move the emphasis into a cell renderer (a colored status pill). Acceptable, but
it only marks one column rather than the row.

Wanted: `rowClassName?: (row: T) => string | undefined`, or a small named-intent variant
(`getRowIntent?: (row: T) => 'none' | 'warning' | 'error' | 'success'`) so skins can render
it consistently rather than each app inventing its own row colors.

**Resolved 2026-08-04.** Both shipped, because they answer different questions. `rowIntent`
(`'success' | 'warning' | 'error' | 'muted'`, `undefined` for a normal row) crosses the
adapter and each skin picks the colours — v8 from the Fluent theme's semantic colours, shadcn
from its tokens. `rowClassName` is the escape hatch for app-supplied CSS. Documented in
[tables.md](../../packages/speel-react/docs/tables.md).

## Derived columns need an escape hatch

`items` must be model entities, since columns resolve against `EntityType` metadata. When a
row's display values come from elsewhere — a parent entity loaded in the same pass, a
computed count, a value masked by business rules — the caller has to build a side map keyed
by id and have every `render` / `sortValue` / `filterValue` close over it.

That works and is not especially ugly, but it is a pattern every non-trivial surface
reinvents. Worth considering: a `rowModel?: (entity: T) => R` prop that derives a per-row
view object once, passed to every column callback alongside the entity.

**Closed 2026-08-04 — documented, not built.** What `rowModel` bought was ergonomic: one
derivation site instead of N callbacks reaching into a map, and an inferred `R`. What it did
not buy was removal of the closure, since `rowModel` still closes over the parent data. Its
caching argument does not survive contact with reality either — a `WeakMap` keyed by entity is
only correct if invalidated when the captured data changes, and an inline arrow has a new
identity every render, leaving either no caching or a `useCallback` requirement whose omission
produces stale rows. Against that it was the only item with type blast radius:
`ColumnDescriptor<T>` becoming `ColumnDescriptor<T, R>` and a second parameter on `render` /
`sortValue` / `filterValue`, noisier for every reader including those who never use it. The
side-map idiom is documented in [tables.md](../../packages/speel-react/docs/tables.md)
instead.

Related, and **not** working as this file first claimed: a `ColumnDescriptor` keyed to a model
field did inherit that field's filter UI, but `descriptorColumn()` returned the field-derived
metadata before anything read the descriptor's `sortValue` / `filterValue`, so both were
silently dropped. A masked column keyed to its own field displayed one value while filtering
and sorting on another. The workaround was to key the column to a synthetic name and
re-supply the Choice options by hand, which loses the inheritance that made keying to the
field attractive.

**Resolved 2026-08-04.** `fieldMeta()` now takes `sortValue` / `filterValue` from the
descriptor when they are present, while the comparator and the `fieldConfig` behind the
filter control stay field-derived — so the inherited dropdown still renders and still
interprets the substituted value the way the field would. Documented in
[tables.md](../../packages/speel-react/docs/tables.md).

## User-configurable views

**Resolved 2026-08-07**, across two cycles: column control, then persistence. All four pieces
below shipped. Documented in
[table-views.md](../../packages/speel-react/docs/table-views.md).

What landed differs from the sketch below in three ways worth recording:

- **State is one lifted value, not four props.** `tableState` carries columns, sort, filters,
  and paging together; `useTableViews` owns it and decides where each part is persisted.
- **Three layers, not one store.** Filters and sort live in the **URL** (so a link carries the
  question and a refresh restores it), columns and page size live in the **view**, and a new
  `scope` prop carries what the _page_ says the table is about. Precedence is URL, then scope,
  then view. `scope` is intent, not access control — that is in the spec and the docs, because
  it is the mistake this design most invites.
- **Columns auto-save; filters and sort do not.** Layout fiddling is casual and constant, so it
  writes through on a debounce with session undo. A data question is worth naming, so it stays
  dirty until Save or Reset.

**The remaining open item is sharing**: views are per user, and a view shared with a colleague
or published by an admin is not built. The `TableViewStore` seam is where that lands without
reshaping anything above it.

The original sketch follows, for the record.

The largest item, and the one the other three feed into. Users want to arrange a table and
keep the arrangement: which columns are shown, their order and widths, the sort, the active
filters — saved as a named view, restored on return, with a designated default.

Pieces this needs, roughly in dependency order:

1. **Column visibility, order, and width as controlled state** — today `columns` is static
   per render and widths are per-descriptor. Views cannot exist until this is a value the
   component can be handed and can hand back.

   **Resolved 2026-08-07.** `columnState` / `defaultColumnState` / `onColumnStateChange` make
   the arrangement a value — controlled if supplied, internal otherwise, reporting in both
   modes — and `columnChooser` adds the UI that edits it. Documented in
   [tables.md](../../packages/speel-react/docs/tables.md).

2. **A serializable view descriptor** — `{ columns, sort, filters }` in a form that survives
   `JSON.stringify`, which means filter criteria need stable serialization (date ranges in
   particular, where a preset like `thisFiscalQuarter` must persist as the preset and not as
   the dates it resolved to on the day it was saved).
3. **A storage seam, not a storage decision** — `@speel/react` should not assume where views
   live. A `viewStore` prop with `load` / `save` / `list` / `remove` lets an app back it with
   a SharePoint list, the user profile service, or `localStorage`. A default
   `localStorage` implementation makes the common case one line.
4. **The view picker UI** — switch, save-as, rename, delete, reset-to-default; plus the
   admin-flavored case of a view shared to everyone rather than owned by one user.

Open questions worth settling before any of this is built: whether a saved view pins the
column set (and so breaks when the model changes) or stores it as a diff from the model's
default; and whether views are a `SpeelTable` concern at all, or a wrapper component that
owns the state and renders a plain `SpeelTable` beneath it. The wrapper reads better —
it keeps the pure table pure — but it only works if item 1 lands first.

**Update 2026-08-07.** The first question is answered, and the answer generalises to the whole
view descriptor: `ColumnState` is an **overlay** on the `columns` prop, not a pinned list.
Unknown keys are dropped silently and unmentioned columns are appended, so a saved view written
against an older model still opens. That also settled a precedent worth carrying into piece 2 —
developer-authored literals like `defaultFilters` throw on a bad key, while user-authored state
that outlives its schema tolerates one. The wrapper question stays open, but item 1 no longer
blocks it: the state is liftable, and `onColumnStateChange` fires in uncontrolled mode too, so a
wrapper can observe before it owns.

## Smaller items

- **CSV export.** The legacy data-table being replaced exports the current (filtered, sorted)
  view to CSV with a configurable file prefix. Nothing in `SpeelTable` covers it, and it is
  a routine ask for a report surface.

  **Resolved 2026-08-04.** `exportCsv` renders a toolbar button; `exportCsv()` on either
  table's `ref` drives the same export from an app's own chrome, prop or no prop. Both cover
  the whole matched set rather than the visible page. A cell's text is read from the element
  tree the column renders — the DOM was not an option, since v8's `DetailsList` virtualises
  and only the on-screen window exists — with `exportValue` as the override. Reading the
  render _before_ the raw field value is what stops a masked column exporting the value it
  was masking.

- **Pagination.** Every row renders. Fine for the permission-trimmed sets seen so far;
  not fine for a table over a large list.

  **Resolved 2026-08-04**, with the premise corrected: "every row renders" was false in the v8
  skin, where `DetailsList` virtualises; it was true in the shadcn skin's plain `<table>`.
  `pageSize` + `pageSizeOptions` page the filtered-and-sorted set client-side, which makes a
  long list navigable and bounds the shadcn DOM. It is not relief for a large fetch — that is
  server-side paging, which stays out of scope while sort and filter are client-side.

- **Column resize.** Prerequisite for views storing widths, and wanted on its own.

  **Resolved 2026-08-04.** `TableProps.onColumnResize` reports drags; `SpeelTable` holds the
  width map and layers it over the per-descriptor width, so a resize survives sorting,
  filtering, paging, and `reload()` — previously the rebuilt `columns` array discarded it. The
  shadcn skin gained real drag handles. Deliberately not public API: widths as a _persisted_
  value is views' to design alongside column visibility and order.
