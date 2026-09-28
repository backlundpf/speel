# Tables

## What & when

`@speel/react` ships two table components. `SpeelEntityTable` is the self-loading
variant: it fetches from the `DbContext`, owns the loading/error states, and exposes a
reload handle via `ref`. `SpeelTable` is a pure data table: the caller passes the items
array and owns all data fetching — useful when you need custom queries, manual `expand`
calls, or any other fetch logic that the automatic variant cannot express. Both components
sort and filter by field type with no per-column configuration required.

## Canonical example

```tsx
import React from "react";
import {
  SpeelEntityTable,
  useOverlays,
  type SpeelEntityTableHandle,
} from "@speel/react";
import { Project } from "../entities/Project";

function ProjectsView() {
  const tableRef = React.useRef<SpeelEntityTableHandle>(null);
  const { toast, showForm } = useOverlays();

  const editProject = async (p: Project) => {
    const { action } = await showForm({
      title: `Edit: ${p.Title ?? ""}`,
      entity: p,
      mode: "edit",
    });
    if (action === "submit") {
      toast.success("Project saved");
      tableRef.current?.reload();
    }
  };

  return (
    <SpeelEntityTable
      ref={tableRef}
      of={Project}
      columns={(p) => [p.Title, p.Status, p.DueDate, p.Owner]}
      rowActions={{ onEdit: (p) => void editProject(p) }}
      emptyMessage="No projects yet."
      loadingMessage="Loading…"
    />
  );
}
```

## Capabilities

### `SpeelEntityTable` — self-loading

`SpeelEntityTable` calls `db.set(of)` on mount, auto-expands every non-inverse
navigation so related display values appear without a manual `expand`, and re-fetches
on each `reload()` call. It accepts the same column/sort/filter/row-action props as
`SpeelTable` via `SpeelEntityTableProps`, but `items` is omitted — the component owns
that array.

**`query` prop.** Supply `query={(set) => set.filter(p => p.IsActive)}` to apply a
custom query before the auto-expand runs. The function is captured in a ref so an inline
arrow does not retrigger the effect.

**Reload handle.** Attach a `ref` typed as `SpeelEntityTableHandle` and call
`ref.current.reload()` to refetch after a create or delete. The inner `SpeelTable`
stays **mounted and hidden** during every reload — the spinner overlays the table but
does not unmount it — so sort order and filter state survive the refetch.

**Loading and error states.** A `Spinner` (with optional `loadingMessage`) shows while
the first load or a reload is in flight. Fetch errors render in a `MessageBar`.

### `SpeelTable` — pure data table

`SpeelTable` requires `items: readonly T[]` and renders exactly what it receives. Reach
for it when the caller owns the fetch — for example, to control the exact `expand` set
or compose results from multiple sets before rendering.

### Columns

Omitting `columns` renders all model properties (minus the key and FK-backing columns)
followed by all navigations. Anything the model marks `isVisible(false)` — property or
navigation, including `SpeelDocument`'s injected file fields — stays out of that default
set; an explicit column spec can still name it.

The idiomatic form uses a **proxy accessor**: the `(p) => [...]` callback receives a
proxy whose property accesses return opaque column refs; named fields get their display
name, sort/filter accessors, and cell renderer from the model metadata automatically.

```tsx
columns={(p) => [p.Title, p.Status, p.DueDate]}
```

To override label, width, or cell rendering for one column, pass a **`ColumnDescriptor`**
inline:

```tsx
columns={(p) => [
  { key: 'Title', render: (r) => <Link onClick={() => view(r)}>{r.Title}</Link> },
  p.Status,
  { key: 'health', header: 'Health', render: (r) => r.DueDate && r.DueDate < new Date()
      ? <span style={{ color: 'crimson' }}>Late</span>
      : <span style={{ color: 'green' }}>On track</span>,
    sortValue: (r) => r.DueDate?.getTime() ?? 0 },
]}
```

A `ColumnDescriptor` whose `key` matches a model field inherits that field's display name,
cell renderer, comparator, and filter control; `sortValue` / `filterValue` then override
only the **value** that column sorts and filters on, leaving the inherited control in place.
A purely custom column (no matching field) is inert until you supply `sortValue`, and
`tableFilter` together with `filterValue`.

That override is what makes a **masked** display value findable: key the column to the model
field so it keeps that field's Choice select, and point `render`, `sortValue`, and
`filterValue` at the masked value. Without all three the row displays one status while
filtering and sorting as another — unfindable by the status the user can actually see. The
side-map idiom under Boundaries shows the shape.

### Opening pre-filtered

`defaultTableState` seeds the same state the header controls write to, so a surface that should
open on "pending" shows filters the user can see and clear rather than a silently narrowed
list:

```tsx
defaultTableState={{
  columns: [],
  filters: {
    Status: { kind: 'select', selected: ['Pending'] },
    DueDate: { kind: 'dateRange', preset: 'thisFiscalQuarter' },
  },
  sort: { key: 'DueDate', direction: 'asc' },
}}
```

It seeds once, and carries sort, columns, and page size in the same value. A key that names
nothing, or a criteria whose `kind` the filter cannot interpret, throws at mount rather than
leaving the table quietly unfiltered — the same guarantee `scope` carries. With views in play,
author `defaultViews` instead: see [table views](table-views.md).

### Row emphasis

`rowIntent` marks a whole row semantically and each skin picks the colours, so the same
predicate reads consistently everywhere — `'success' | 'warning' | 'error' | 'muted'`, or
`undefined` for a normal row. When that vocabulary does not fit, `rowClassName` takes a class.

### Choosing columns

`columnChooser` adds a toolbar control for showing, hiding, and reordering columns — drag a row
or use its move buttons — plus a reset. The arrangement is part of one lifted value:
`tableState` controls columns, sort, filters, and paging together, `defaultTableState` seeds
it, and `onTableStateChange` reports every change in **both** modes, so an app can persist
without owning it. Widths from a header drag are the exception: they stick across sorting,
filtering, paging, and `reload()`, but they are session-only — never part of the lifted state,
never reported, and gone on refresh. A width authored into a column descriptor or a saved view
still applies as the baseline the drag floats on top of.

The column arrangement is an _overlay_ on `columns`: entries naming a column that no longer
exists are ignored, and columns it does not mention are appended — so adding a property to the
model reaches users who have already customised their table. For saved views over that state,
shareable links, and the `scope` layer, see [table views](table-views.md).

### Paging, export, and print

`pageSize` switches on a pager over the filtered-and-sorted set, with a rows-per-page picker
(`pageSizeOptions`, defaulting to 10/25/50/100). Omitted, every row renders. Paging is
client-side: it makes a long list navigable, but the fetch still pulls everything. The footer
reads `‹ Page [2] of 7 ›` — the page is a picker, so a distant page is one pick away rather
than five clicks — with the item count at the other end of the same line.

`exportCsv` adds an Export button to the toolbar; `toolbar` puts your own controls beside it.
Both components also expose `exportCsv()` on their `ref`, which works whether or not the prop
was passed. Either way the file covers every matched row, not just the visible page — and only
the visible columns. Each cell exports the text it displays; `exportValue` overrides that, and
is how you emit a raw number or ISO date for a file something else will parse.

`exportXlsx` is the spreadsheet sibling: the same matched rows and visible columns as the
CSV, written as a real `.xlsx` workbook — one sheet, a bold header row, and columns sized to
their content. The difference that matters is that cells are **typed**: a column with an
`exportValue` returning a number arrives as a number Excel can sum, a `Date` as a real date
cell, a boolean as Yes/No, and an empty value as a genuinely blank cell. Columns without an
`exportValue` still export their displayed text, exactly as the CSV does. Name the file and
the sheet with `exportXlsx={{ fileNamePrefix: 'requests', sheetName: 'Open requests' }}`, or
fire it yourself with `ref.current.exportXlsx()`.

`print` is the paper sibling: it adds a Print button that opens a plain black-on-white report
— title, generated-at stamp, and the same matched rows and visible columns the export covers —
and sends it to the browser's print dialog. `print` titles the report after the entity,
`print={{ title: 'Request Status Report' }}` names it yourself, and `ref.current.print()` fires
it from your own control. Cells read exactly as they do in the CSV, `exportValue` included.

### Type-driven sort and filter

Every model-backed column gets a per-header filter control and a clickable sort affordance
without configuration. While any filter is active, the bar of clearable chips above the table
also reports `12 of 340 items`, so it is never ambiguous that rows are being omitted. The
filter kind is inferred from the field type:

| Field type                    | Filter kind                                                 |
| ----------------------------- | ----------------------------------------------------------- |
| `Text`, `MultiLine`, `Url`, … | text contains                                               |
| `Number`, `Currency`          | numeric range                                               |
| `DateTime`                    | date range (from/to pickers)                                |
| `Boolean`                     | three-way (yes / no / any)                                  |
| `Choice`, `MultiChoice`       | multi-select of the declared options; text for an open list |

Date columns can additionally offer a preset dropdown (`today`, `thisWeek`, `thisMonth`,
`thisQuarter`, `thisYear`, `yearToDate`, `last7Days`, `last30Days`, `thisFiscalYear`,
`thisFiscalQuarter`) — presets are opt-in: declare them on the model with
`.useTableFilter({ kind: 'dateRange', presets: [...] })`. Fiscal-year presets resolve from
`SpeelProvider`'s `fiscalYearStartMonth` config (default October). Sort order is type-aware:
numeric, date, and choice fields sort naturally (a choice by declared position, or by text
when its list is open); text falls back to `localeCompare`; empty values sort last. Pass
`sortable={false}` or `filterable={false}` to disable globally; pass
`tableFilter={{ kind: 'none' }}` in a `ColumnDescriptor` to suppress the filter for a
specific column.

**A filter or sort key does not need a column.** Keys resolve against the columns first and
then against the model itself, deriving the same accessor, comparator, and filter an automatic
column would — so a view that filters on `FiscalYear` works whether or not that column is
displayed, and its chip is labelled with the field's display name. Defining a column purely to
make a saved filter true is never necessary.

**A `Json` column is the one field type left out of the table above.** It renders and exports
(the shape's first visible property, joined across elements for a `multi` value — the same
headline `formatFieldValue` gives a Json cell everywhere) but it never sorts or filters, even
with an override — there is no honest comparator for a shape and no per-scalar filter kind for
one. A **custom** column sorts instead: give it a `key` that names no model field, and its own
`sortValue` gets a natural comparator rather than being ignored:

```tsx
{ key: 'StepCount', header: 'Steps', render: (r) => r.Tasks?.length ?? 0,
  sortValue: (r) => r.Tasks?.length ?? 0 }
```

### Search

`search` adds a search box to the toolbar — `search={{ placeholder: 'Find a request' }}` names
it. It reads **what you see**: the text of every visible column, exactly as export and print
read it, so a masked column is found by its mask and a hidden column is not searched. Every
whitespace-separated term must appear somewhere in the row, in any order and any case —
`smith 2026` finds Smith's 2026 rows. The search narrows the same set the column filters do,
so the footer reads `12 of 340 items`, export and print follow it, and the chip bar's Clear
clears it along with the chips; it works whether or not `filterable` is on. The text is part
of `tableState` (`search`), so a link carries it and a view can save it: see
[table views](table-views.md).

### Row actions

`rowActions={{ onView?, onEdit?, onDelete?, custom? }}` renders icon buttons in a
trailing actions column. Each callback receives the row entity. Any subset can be
provided; if none are given the column is omitted entirely. `custom` adds
domain-specific actions after the built-ins:

```tsx
rowActions={{ onEdit, custom: [
  { key: 'upload', iconName: 'Upload', title: 'Upload artifact',
    onClick: (p) => void uploadArtifact(p) },
] }}
```

## Boundaries & gotchas

- **`items` is required on `SpeelTable`** — it is a pure renderer with no internal
  fetch. If you accidentally omit it, TypeScript will flag the call site.

- **Sort/filter state survives reload.** Because `SpeelEntityTable` keeps the inner
  `SpeelTable` mounted (hidden) during a reload, any sort or filter the user has applied
  is preserved when new data arrives. Unmounting the component resets it.

- **Auto-expand covers only outbound navs.** `SpeelEntityTable` automatically expands
  navigations whose FK lives on the entity itself — references, user fields, and
  multi-value lookups alike. Inverse-FK collections (e.g. child items pointing
  back at a parent) are not auto-loaded — they would be an N+1 per row and are not
  typical table columns. Use `SpeelTable` with a manual query if you need them.

- **`sortValue` on a field-keyed column keeps the field's comparator.** That is the point —
  a masked `Choice` value still sorts in declared option order rather than alphabetically,
  and a masked value still matches the same filter control — but the value you return has to
  belong to the field's domain. If you need a sort key of a different type, key the column to
  a name of its own: a custom column gets a natural comparator instead.

- **Entity must be registered.** `SpeelTable` (and by extension `SpeelEntityTable`)
  throws immediately if the `of` constructor is not registered in the model. Check
  `onModelCreating` in your context class.

- **A `Json` column never sorts, even with `sortable: true` or a `sortValue`.** There is no
  honest comparator for a shape, so a field-keyed column ignores both — see Type-driven sort
  and filter above for the custom-column workaround.

- **Derived values live in a side map.** `items` must be model entities, since columns
  resolve against `EntityType` metadata. When a row's display values come from elsewhere — a
  parent loaded in the same pass, a computed count, a value masked by business rules — derive
  them once and let the column callbacks close over the result:

  ```tsx
  const view = React.useMemo(
    () => new Map(rows.map((r) => [r.Id, { masked: mask(r, parents), daysOpen: age(r) }])),
    [rows, parents],
  );

  columns={[
    { key: 'Status',
      render:      (r) => <StatusPill value={view.get(r.Id)!.masked} />,
      sortValue:   (r) => view.get(r.Id)!.masked,
      filterValue: (r) => view.get(r.Id)!.masked },
  ]}
  ```

- **Hiding a column keeps its sort and its filter.** Both resolve from the full column set, not
  the visible one — and from the model when no column carries the key at all — so hiding a
  filtered column narrows nothing; the chip above the table stays the way to clear it. Sort has
  no chip, so a table sorted by a hidden column looks unsorted.

- **Columns keep their widths; the table scrolls.** Every rendered column is laid out at the
  width it holds — a live drag, else a view or descriptor width, else a readable default — and
  when those add up to more than the container the table scrolls horizontally, header and rows
  together, rather than compressing sixteen columns into slivers. Only when they fit does the
  last column stretch into the slack. Nothing outside the table moves sideways, and a drag is
  still session-only: it never enters the lifted state and is gone on refresh. A header label
  never truncates either: it wraps and the header row grows, with the full label as the hover
  tooltip. Only a single word wider than the whole column breaks mid-word — the cue to widen it.

- **Print mirrors the screen too.** The report carries the filtered rows and the visible
  columns — the whole matched set, not the rendered page — so a filter narrows what prints and
  a hidden column stays off the paper. Printing needs a popup window: if the browser blocks it,
  the action is a silent no-op rather than an error.

- **Export mirrors the screen.** A cell's text is read from what the column renders, so a
  masked column exports the masked value and a currency column exports `$1,234.00` rather than
  `1234`. Two consequences: a cell whose text lives inside a custom component
  (`<StatusPill value={x} />`) has no readable text until it renders, so give those columns an
  `exportValue`; and in the CSV, values beginning with `=`, `+`, `-`, or `@` are prefixed with
  an apostrophe, since Excel would otherwise execute them as formulas. The xlsx writer needs
  no such guard — it writes inline strings, which Excel never evaluates — so the apostrophe
  appears in the CSV only.

- **`$1,234.00` is text in a spreadsheet too.** A typed xlsx cell is only as typed as its
  source: without an `exportValue` the writer receives the rendered string, and a column of
  formatted currency lands as text Excel will not sum. If the workbook is meant to be
  calculated on rather than read, give those columns an `exportValue` returning the raw
  number or `Date`.
