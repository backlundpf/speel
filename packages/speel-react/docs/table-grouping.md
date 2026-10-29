# Table grouping

## What & when

`groupBy` turns a table's rows into nested, collapsible groups — groups, subgroups,
sub-subgroups, as deep as you list levels. Each group header names its value and counts its
rows, the toolbar gains one button that expands or collapses everything, and each level says
whether its groups start open or closed. Reach here when a list reads better split by a
status, an owner, or a bucket you compute (overdue vs. upcoming), and users want to fold away
what they are not looking at.

Grouping is presentation over the rows the table already matches: it applies after the
scope, filters, search and sort, and it works the same on `SpeelTable` and
`SpeelEntityTable`.

## Canonical example

```tsx
import React from "react";
import { SpeelEntityTable, type SpeelEntityTableHandle } from "@speel/react";
import { Task } from "../entities/Task";

function TaskBoard() {
  const tableRef = React.useRef<SpeelEntityTableHandle>(null);
  return (
    <SpeelEntityTable
      ref={tableRef}
      of={Task}
      columns={(p) => [p.Title, p.Owner, p.DueDate]}
      groupBy={(p) => [
        // Outermost level: one group per status, in the choice's declared order.
        p.Status,
        // Second level: one per owner, starting folded, with a header of your own.
        {
          key: p.Owner.key,
          collapsed: true,
          header: (g) => (
            <b>
              {g.label} · {g.count} open
            </b>
          ),
        },
        // Innermost: a bucket no column holds.
        {
          key: "due",
          by: (t) =>
            t.DueDate && t.DueDate < new Date() ? "Overdue" : "Upcoming",
        },
      ]}
    />
  );
}
```

The list is flat, outermost first; the nesting on screen comes from the data. `groupBy` takes
the same callback as `columns`, so `p.Status` is checked against the entity; a plain array of
field names (`groupBy={["Status", "Owner"]}`) works too.

## Capabilities

### Levels from columns or computed values

A level that names a column — a ref, a field name, or a descriptor without `by` — groups on
what that column sorts on (its `sortValue` override if it has one, else the field) and labels
each group with the column's display text, the same text search and export read. Grouping by
a column the user has hidden in the column chooser keeps working, and a field the table has no
column for groups as that field's default column would.

A descriptor with `by` groups on whatever `by` returns. Its `key` is then only the level's
id: it takes nothing from a column of the same name. `label` turns a value into the group's
text for either kind of level.

### Headers and counts

The default header is `Status: Open (12)` for a column level and `Overdue (3)` for a computed
one; the count is every matched row under the group, across all its subgroups. `header`
replaces the whole thing — count included — and is handed the group: its `label`, `value`,
`count`, `level`, `rows` and `parent`. Empty values form one `(blank)` group.

Default headers step down by level so the outer groups read first: the top level is dark and
semibold, the second muted and semibold, the third and deeper muted and regular — every step
still legible. A `header` of your own is rendered as given, with none of that styling.

### Order

Groups at each level sort by their value with the column's own comparator — a Choice in its
declared order, a date chronologically — ascending by default; `order: "desc"` or a compare
function changes that. The blank group is always last. The table's column sort orders rows
_inside_ the innermost groups and never reorders the groups themselves.

### Expanding and collapsing

`collapsed` sets a level's starting state — `true`, or a function of the group. Each header
has its own toggle, and the toolbar button reads **Collapse all** while any group on screen is
open, **Expand all** otherwise. That button, and `expandAllGroups()` / `collapseAllGroups()` on
both components' handles, set the whole table for the rest of the visit: groups that appear
later — after a filter change or a `reload()` — follow it. A group the user folds stays folded
while it is filtered away and back. None of this is saved: collapse state is not part of
`tableState`, views, or the URL.

### Grouping and paging

A grouped table is not paged. When `groupBy` is set, `pageSize` — from the prop or from
`tableState` — is ignored, every matched row is rendered, and the footer keeps its item count.
The page state is left as it was, so removing `groupBy` brings the pager back on the same page.
A console warning, once per mount, says why the pager is gone.

### Export and matched rows

CSV, Excel, print and `onMatchedRowsChange` see the matched rows in grouped order — group
by group, each in the table's sort — but stay flat: no group heading rows are written.

### Skins

Skins receive the rows flat in grouped order plus a `groups` tree (`TableGroupNode`: header,
label — the group's whole path as text, "Status: Open, Owner: Ann", which names its toggle —
count, level, start index, collapsed, `customHeader`, children) and an `onToggleGroup(id)`
callback; they never hold collapse state themselves. Both built-in skins indent only the group
headers — data rows sit flush under the column headers, with no nesting column in front of
them. The Fluent v8 skin renders them as `DetailsList` groups and the shadcn skin as header
rows with a chevron; a custom skin that ignores `groups` renders a plain table in grouped
order.

## Boundaries & gotchas

- **Groups are their label text.** Rows whose values display the same text share a group, so
  two groups never look alike — and two distinct values that render identically merge. A
  date-only field groups by day; a field that shows the time groups by the time shown.

- **Grouped tables render every row.** The v8 skin virtualizes, so large grouped sets stay
  quick there; the shadcn skin renders each row, so a grouped table of thousands of rows is
  slow in it. Filter or scope large sets before grouping them.

- **An unknown key throws.** A level without `by` must name a column or a field of the entity;
  otherwise the table throws while rendering, naming the key. `groupBy` is code, versioned with
  the model, so a typo is a bug rather than stale user data.

- **A computed level is self-contained.** `{ key: "Status", by: … }` gets no `Status:` prefix,
  no Choice ordering and no column text: give it `label`, `header` or `order` yourself.

- **Fresh `groupBy` every render is fine.** Collapse state is keyed by each group's path of
  labels, not by the configuration's identity, so an inline callback does not reset it.
