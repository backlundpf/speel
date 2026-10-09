# Table sort, filter, and search

## What & when

`SpeelTable` and `SpeelEntityTable` sort and filter every model-backed column by its field
type, with no per-column configuration, and can add a search box that reads what the screen
shows. Reach here when a table should open already narrowed, when a column should sort or
filter on something other than its stored value, or when users need to find a row by typing.
Column definitions are on [table columns](table-columns.md), the components on [tables](tables.md).

## Canonical example

```tsx
import { SpeelEntityTable } from "@speel/react";
import { Request } from "../entities/Request";

function OpenRequests() {
  return (
    <SpeelEntityTable
      of={Request}
      columns={(r) => [r.Title, r.Status, r.DueDate, r.Owner]}
      search={{ placeholder: "Find a request" }}
      defaultTableState={{
        columns: [],
        filters: {
          Status: { kind: "select", selected: ["Pending"] },
          DueDate: { kind: "dateRange", preset: "thisFiscalQuarter" },
        },
        sort: { key: "DueDate", direction: "asc" },
      }}
    />
  );
}
```

The table opens on pending requests due this fiscal quarter, soonest first. The two filters
show as chips the user can clear, the header controls reflect them, and the search box
narrows the same set further.

## Capabilities

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

## Boundaries & gotchas

- **`sortValue` on a field-keyed column keeps the field's comparator.** That is the point —
  a masked `Choice` value still sorts in declared option order rather than alphabetically,
  and a masked value still matches the same filter control — but the value you return has to
  belong to the field's domain. If you need a sort key of a different type, key the column to
  a name of its own: a custom column gets a natural comparator instead.

- **A `Json` column never sorts, even with `sortable: true` or a `sortValue`.** There is no
  honest comparator for a shape, so a field-keyed column ignores both — see Type-driven sort
  and filter above for the custom-column workaround.

- **Hiding a column keeps its sort and its filter.** Both resolve from the full column set, not
  the visible one — and from the model when no column carries the key at all — so hiding a
  filtered column narrows nothing; the chip above the table stays the way to clear it. Sort has
  no chip, so a table sorted by a hidden column looks unsorted.
