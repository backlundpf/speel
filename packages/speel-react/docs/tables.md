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

### Opening pre-filtered, sorting, filtering, and searching

Every model-backed column sorts and filters by its field type with no configuration;
`defaultTableState` opens the table on filters the user can see and clear, and `search` adds
a toolbar search over the visible text. All of it is on
[table sort, filter, and search](table-filtering.md).

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

### Paging

`pageSize` switches on a pager over the filtered-and-sorted set, with a rows-per-page picker
(`pageSizeOptions`, defaulting to 10/25/50/100). Omitted, every row renders. Paging is
client-side: it makes a long list navigable, but the fetch still pulls everything. The footer
reads `‹ Page [2] of 7 ›` — the page is a picker, so a distant page is one pick away rather
than five clicks — with the item count at the other end of the same line.

### Export and print

`exportCsv`, `exportXlsx`, and `print` add toolbar actions that write out every matched row
and the visible columns — as CSV, as a typed Excel workbook, or as a print report. See
[table export](table-export.md).

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

- **Entity must be registered.** `SpeelTable` (and by extension `SpeelEntityTable`)
  throws immediately if the `of` constructor is not registered in the model. Check
  `onModelCreating` in your context class.


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


- **Columns keep their widths; the table scrolls.** Every rendered column is laid out at the
  width it holds — a live drag, else a view or descriptor width, else a readable default — and
  when those add up to more than the container the table scrolls horizontally, header and rows
  together, rather than compressing sixteen columns into slivers. Only when they fit does the
  last column stretch into the slack. Nothing outside the table moves sideways, and a drag is
  still session-only: it never enters the lifted state and is gone on refresh. A header label
  never truncates either: it wraps and the header row grows, with the full label as the hover
  tooltip. Only a single word wider than the whole column breaks mid-word — the cue to widen it.
