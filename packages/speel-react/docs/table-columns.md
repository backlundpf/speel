# Table columns

## What & when

A `SpeelTable` or `SpeelEntityTable` column comes from the model: name a field and it brings
its display name, cell renderer, sort comparator, and filter control with it. Reach for this
page when one column needs more — a width, a different header or cell, long values wrapped
onto more lines, a control in its header — or when a column is not a field at all. The
components themselves, paging, and row actions are on [tables](tables.md).

## Canonical example

```tsx
import React from "react";
import { Checkbox } from "@fluentui/react";
import { SpeelTable } from "@speel/react";
import { Project } from "../entities/Project";

function ProjectPicker({ projects }: { projects: readonly Project[] }) {
  const [picked, setPicked] = React.useState<ReadonlySet<Project>>(new Set());
  const allPicked = projects.length > 0 && picked.size === projects.length;
  const toggle = (row: Project) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(row)) next.add(row);
      return next;
    });

  return (
    <SpeelTable
      of={Project}
      items={projects}
      columns={(p) => [
        {
          key: "pick",
          header: "Selected",
          headerContent: (
            <Checkbox
              ariaLabel="Select all projects"
              checked={allPicked}
              onChange={() =>
                setPicked(allPicked ? new Set() : new Set(projects))
              }
            />
          ),
          render: (r) => (
            <Checkbox
              ariaLabel={`Select ${r.Title ?? "project"}`}
              checked={picked.has(r)}
              onChange={() => toggle(r)}
            />
          ),
          width: 40,
          cellTitle: false,
        },
        p.Title,
        p.Owner.with({ width: 170 }),
        p.Notes.with({ wrap: true }),
      ]}
    />
  );
}
```

`p.Title` is the field's column exactly as the model describes it;
`p.Owner.with({ width: 170 })` is the same column at a fixed width, and
`p.Notes.with({ wrap: true })` lets long notes run onto more lines. The first column is not a
field: `render` draws a checkbox per row, `headerContent` puts a select-all checkbox where the
label would be, and `header` still names the column "Selected" in the column chooser and
exports. `cellTitle: false` gives the interactive cell its bare layout back (see Boundaries).

## Capabilities

### Column refs: `p.Field` and `.with()`

The `columns` callback receives a map of column refs — one per data property of the entity —
so a misspelt `p.Ttile` is a compile error. A bare ref is the field's column as the model
describes it. `.with({ ... })` takes the same options a descriptor does and returns a column
still keyed to that field: it keeps the field's display name, cell renderer, comparator, and
filter control for everything you leave out.

```tsx
columns={(p) => [
  p.Title.with({ render: (r) => <Link onClick={() => view(r)}>{r.Title}</Link> }),
  p.Status,
  p.DueDate.with({ header: "Due", width: 110 }),
]}
```

`render`, `sortValue`, `filterValue`, and `exportValue` are typed on the entity, so `r` needs
no annotation. Omitting `columns` altogether renders the model's visible fields — see
[tables](tables.md).

### Descriptors and custom columns

`.with()` returns a plain `ColumnDescriptor`: the options plus a string `key`. You can write
one directly, and `columns` also takes an array of descriptors and field-name strings instead
of a callback — the form for a column list built outside render. A descriptor whose `key`
names a model field inherits exactly what `.with()` would; `sortValue` / `filterValue` then
override only the **value** that column sorts and filters on, leaving the inherited
comparator and filter control in place.

A key that names no field is a **custom column**. It must bring its own `render`, and it is
inert until you supply `sortValue`, and `tableFilter` together with `filterValue`:

```tsx
columns={(p) => [
  p.Title,
  { key: "health", header: "Health",
    render: (r) => r.DueDate && r.DueDate < new Date()
      ? <span style={{ color: "crimson" }}>Late</span>
      : <span style={{ color: "green" }}>On track</span>,
    sortValue: (r) => r.DueDate?.getTime() ?? 0 },
]}
```

That value override is what makes a **masked** display value findable: key the column to the
model field so it keeps that field's Choice select, and point `render`, `sortValue`,
`filterValue`, and `exportValue` at the masked value (`view` is the side map under
[tables](tables.md#boundaries--gotchas)):

```tsx
columns={(p) => [
  p.Status.with({
    render:      (r) => <StatusPill value={view.get(r.Id)!.masked} />,
    sortValue:   (r) => view.get(r.Id)!.masked,
    filterValue: (r) => view.get(r.Id)!.masked,
    exportValue: (r) => view.get(r.Id)!.masked,
  }),
]}
```

Leave one out and the row displays one status while sorting, filtering, or exporting as
another — unfindable by the status the user can actually see. The pill's text lives inside
your component, where the table cannot read it, so without `exportValue` search, export, and
the hover title all read the stored status.

### Widths

Every column holds a width, and when they add up to more than the container the table
scrolls rather than squeezing them. A width you author (`.with({ width })`), one from a saved
view, and one from a header drag win as given. In the Fluent v8 skin a column nobody has
sized is held at a default for its field kind — a Yes/No needs little, a note needs room:

| Field kind               | Default | Multi / multiline / with time   |
| ------------------------ | ------- | ------------------------------- |
| `Boolean`                | 70      | —                               |
| `Number`, `Currency`     | 90      | —                               |
| `DateTime`               | 100     | 150 (`DateTime` display format) |
| `Choice`                 | 120     | 180 (multi)                     |
| `Text`                   | 180     | 260 (multiline / Note)          |
| `Lookup` (person, too)   | 180     | 220 (multi)                     |
| `Json`                   | 180     | —                               |
| custom column (no field) | 100     | —                               |

A defaulted column is raised — never lowered — until its header's longest word fits beside
its sort arrow and filter button, so a Yes/No column headed "Requires approval" is as wide as
"approval" needs, not 70. The floor never touches a width someone gave. The row-actions
column is as wide as its buttons.

### Wrapping long values

`wrap: true` lets a column's values break onto more lines, at spaces, and the row grows to
hold them — the choice for notes, descriptions, and long titles. Both skins honour it. In the
Fluent v8 skin a single word wider than the column ends in "…" rather than splitting
mid-word, the same rule header labels follow; the shadcn skin does not cut it, and the word
overflows the column. Without `wrap` a value stays on one line and is cut off with "…".

### Hover titles on cut-off cells

When a value is cut off, hovering the cell shows its full text as the browser's tooltip; a
value that fits shows none. It is on for every data column, in both skins, and is worked out
only when the pointer arrives, so it costs nothing per render. The title is the text the
toolbar search and CSV export read: `exportValue` when the column has one, otherwise the text
`render` returns. A cell whose text lives inside your own component — `<StatusPill />` — has
none the table can read and falls back to the field's stored value, so give such a column an
`exportValue`. `cellTitle: false` turns the title off for one column: one whose cell brings
its own tooltip, or an interactive cell with no text to show.

### A control in the header

`headerContent` renders any node in the header in place of the label — a select-all
checkbox, an icon, a small menu — and a filter button still sits beside it when the column is
filterable. `header` keeps naming the column everywhere a string is needed: the export and
print header row, the column chooser, filter chips, the filter button's accessible name, and
— in the Fluent v8 skin — the column header a screen reader announces. Give a custom column
with `headerContent` a `header` too; without one those places fall back to its `key`. The
node itself gets no hover title or name from `header`, so a control in it needs its own
accessible name — the example's `ariaLabel`.

## Boundaries & gotchas

- **Drop the entity annotation on the callback.** `columns={(p: Project) => [...]}` does not
  compile: the parameter is a map of column refs (`ColumnRefs<Project>`), not an entity.
  Delete the annotation — the refs are inferred from `of`.

- **A string key is unchecked.** A descriptor's `key` and a string spec are plain strings. A
  misspelt field key with a `render` silently becomes a custom column that sorts and filters
  on nothing; without a `render` the table throws when it resolves its columns. Reach a field
  through `p.Field.with()` and the compiler catches the typo.

- **A `headerContent` header does not sort on click.** A control inside a sort button would
  sort on every click and is invalid nested interactive content, so that header is never a
  sort button. The column still sorts through `tableState` / `defaultTableState` or a saved
  view — see [table sort, filter, and search](table-filtering.md).

- **Header labels break only at spaces.** In the Fluent v8 skin a long label wraps at spaces
  and the header row grows; the filter button stays beside the label, never under it. A
  single word wider than the label box ends in "…", and the full label is the hover title —
  the cue to widen the column. The shadcn header stays on one line and truncates.

- **Data cells sit in a clipping box (v8).** A data column's cell content renders inside a
  box that clips its overflow — that is how the table tells a cut-off value and draws its
  "…". The box leaves room around its content for a focus ring, so a link or checkbox in the
  cell keeps its whole outline, but a control wider than the column is cut at the cell edge
  like text. `cellTitle: false` on a column without `wrap` renders the bare cell.

- **shadcn sizes to content.** The shadcn skin ignores the per-kind defaults and the header
  floor: a column without a width sizes to its content, the row-actions column included. An
  authored, view, or dragged width applies in both skins.

- **Upgrading moves unsized v8 columns.** Before the per-kind defaults every unsized column
  started at 100px; now a Yes/No column narrows, a note widens, and the row-actions column
  shrinks to its buttons. If a column reads wrong, give it a `width` — `.with({ width })` —
  rather than fighting the default.
