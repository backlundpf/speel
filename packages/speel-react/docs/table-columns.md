# Table columns

## What & when

A `SpeelTable` or `SpeelEntityTable` column comes from the model: name a field and it brings
its display name, cell renderer, sort comparator, and filter control with it. Reach for this
page to size or align columns or fit the table to its container, or when a column needs more —
another header or cell, a cell that opens its row, wrapping, a control in its header — or is
not a field at all. The components themselves, paging, and row actions are on [tables](tables.md).

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
      minWidth="100%"
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

`p.Title` is the field's column exactly as the model describes it; `p.Owner.with({ width: 170 })`
is the same column starting at 170px; `p.Notes.with({ wrap: true })` lets long notes run onto
more lines. `minWidth="100%"` fills the container: Title and Owner take one share of the spare
width each and Notes, a note, two. The first column is not a field: `render` draws a checkbox per
row, `headerContent` puts a select-all checkbox where the label would be, and `header` still
names the column "Selected" in the column chooser and exports. `cellTitle: false` gives the
interactive cell its bare layout back (see Boundaries).

## Capabilities

### Column refs: `p.Field` and `.with()`

The `columns` callback receives a map of column refs, one per data property, so a misspelt
`p.Ttile` is a compile error. A bare ref is the field's column as the model describes it.
`.with({ ... })` takes the same options a descriptor does and returns a column
still keyed to that field: it keeps the field's display name, cell renderer, comparator, and
filter control for everything you leave out — `p.DueDate.with({ header: "Due", width: 110 })`
renames and sizes the due-date column and nothing else. `render`, `sortValue`, `filterValue`,
and `exportValue` are typed on the entity, so `r` needs no annotation. Omitting `columns`
renders the model's visible fields — see [tables](tables.md).

### Descriptors and custom columns

`.with()` returns a plain `ColumnDescriptor`: the options plus a string `key`. You can write one
directly, and `columns` also takes an array of descriptors and field-name strings instead of
a callback — for a column list built outside render. A descriptor whose `key` names a
model field inherits exactly what `.with()` would; `sortValue` / `filterValue` then override
only the **value** that column sorts and filters on, keeping the inherited comparator and filter.

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

That override makes a **masked** display value findable: key the column to the model field so
it keeps that field's Choice select, and point `render`, `sortValue`, `filterValue`, and
`exportValue` at the masked value (`view` is the side map under [tables](tables.md#boundaries--gotchas)):

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

Leave one out and the row shows one status while sorting, filtering, or exporting another;
without `exportValue`, search, export, and the hover title read the stored status.

### Column widths

Columns are laid out the way CSS flexbox lays out items. Each starts at its **basis**: the
`width` you author, one from a saved view or a header drag, else its field kind's default:

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

A defaulted basis is raised — never lowered — until the header's longest word fits beside its
sort arrow and filter button, so a Yes/No column headed "Requires approval" starts wider than
70; the row-actions column is as wide as its buttons.

With no bounds the table is exactly as wide as its columns' bases. Give the table `minWidth`,
`width`, or `maxWidth` — pixels, or a percentage of its container — and the columns flex to meet
it. Spare width goes to the columns that **grow**, by weight; a shortfall comes out of the
columns that **shrink**, scaled by basis as in CSS. By default Text, Lookup, and Choice columns
grow and shrink alike, Note and Json columns take twice the spare width, and Yes/No, Number,
Currency, Date, custom, and row-actions columns hold their basis; `.with({ grow, shrink })`
overrides that and `.with({ minWidth, maxWidth })` bounds it. Without its own `minWidth` a column
is never squeezed below its header's longest word (nor 40px), or its basis if that is narrower.

`minWidth="100%"` fills the container through the growers; `maxWidth="100%"` fits it, squeezing
the shrinkers toward their minimums. Columns that need more room than the container scroll
horizontally, header and rows together. A column dragged by its header stays where it is
dropped — never below 40px or its `minWidth`, never past its `maxWidth` — and the others flex
around it; a drag is session-only (see [tables](tables.md#choosing-columns)).

### Wrapping and alignment

`wrap: true` lets a column's values break onto more lines, at spaces, and the row grows to
hold them — the choice for notes, descriptions, and long titles. A single word wider than the
column ends in "…" rather than splitting mid-word, as header labels do. Without `wrap` a value
stays on one line and is cut off with "…".

`.with({ align: "end" })` sets a column's header label and cells against its end edge — the
right, on a left-to-right page — and `"center"` centres them. It moves text and inline controls
such as links. The default is `"start"` for every field kind, so a number column lines up on
its last digit only when it says `"end"`. Alignment is horizontal only and changes nothing in
export, print, search, or sorting.

### Hover titles on cut-off cells

When a value is cut off, hovering the cell shows its full text as the browser's tooltip; a
value that fits shows none. It is on for every data column in both skins. The title is the text the toolbar search and CSV export read:
`exportValue` when the column has one, otherwise the text `render` returns. A cell whose text
lives inside your own component — `<StatusPill />` — has none the table can read and falls back
to the field's stored value, so give such a column an `exportValue`. `cellTitle: false` turns
the title off for a column whose cell brings its own tooltip or has no text to show.

### A cell that opens its row

Render the cell as the skin's `ui.Link` — inline text on one line, no taller than the row's
other text. `href` makes it a real anchor (open in a new tab works); `onClick` replaces
navigation on a plain left click only, so modified and middle clicks still use the `href`:

```tsx
const ui = useSpeelUI(); // from "@speel/react", in the component rendering the table

columns={(p) => [
  p.Title.with({
    render: (t) => <ui.Link text={t.Title ?? ""} href={urlOf(t)} onClick={() => open(t)} />,
  }),
  p.Owner,
]}
```

A title too long for the column is cut off at its end with "…" and shows its full text on
hover. Without `href` it is a button that looks the same.

### A control in the header

`headerContent` renders any node in the header in place of the label — a select-all checkbox,
an icon, a small menu — and a filter button still sits beside it when the column is
filterable. `header` keeps naming the column everywhere a string is needed: the export and
print header row, the column chooser, filter chips, the filter button's accessible name, and —
in the Fluent v8 skin — the column header a screen reader announces. Give a custom column with
`headerContent` a `header` too; without one those places fall back to its `key`. The node gets
no hover title or name from `header`, so a control in it needs its own accessible name.

## Boundaries & gotchas

- **Drop the entity annotation on the callback.** `columns={(p: Project) => [...]}` does not
  compile: the parameter is a map of column refs (`ColumnRefs<Project>`), inferred from `of`.

- **A string key is unchecked.** A misspelt field key with a `render` silently becomes a custom
  column that sorts and filters on nothing; without a `render` the table throws when it
  resolves its columns. Reach a field through `p.Field.with()` and the compiler catches it.

- **A `headerContent` header does not sort on click** (a control inside a sort button is
  invalid nested interactive content). The column still sorts through `tableState` /
  `defaultTableState` or a saved view — see [table sort, filter, and search](table-filtering.md).

- **Header labels break only at spaces**, growing the header row, the filter button beside
  them. A word wider than the label box ends in "…" with the full label as its hover title —
  the cue to widen the column.

- **`align` is CSS text alignment.** It moves text and inline controls; a block-level control
  (a checkbox, a full-width component) keeps its place unless wrapped inline-block:
  `render: (r) => <span style={{ display: "inline-block" }}><ui.Checkbox … /></span>`. A link
  in a `wrap` column still truncates on one line; `wrap` suits long plain text.

- **Data cells sit in a clipping box (v8).** A data cell renders inside a box that clips its
  overflow — how the table tells a cut-off value and draws its "…". The box leaves room for a
  focus ring, but a control wider than the column is cut at the cell edge like text.
  `cellTitle: false` on a column without `wrap` or `align` renders the bare cell.

- **An authored `width` is a starting width.** A growing column widens past it and a shrinking
  one narrows; `.with({ width, grow: 0, shrink: 0 })` pins it.

- **Upgrading moves columns.** Unsized v8 columns used to start at 100px and unsized shadcn
  columns sized to their content; both skins now start one at its kind's default, so a Yes/No
  column narrows, a note widens, and the row-actions column shrinks to its buttons. A table
  without bounds no longer fills its container (the v8 last column stretched; a shadcn table
  was `w-full`) — `minWidth="100%"` fills it. A shadcn table also has a fixed layout (a long
  value no longer widens its column) and shows its sort arrow only on the sorted column. If a
  column reads wrong, give it a `width`.
