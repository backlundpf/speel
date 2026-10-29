# Table grouping — design

Date: 2026-10-29 · Status: approved in conversation, pending written-spec review

## Goal

`SpeelTable` (and `SpeelEntityTable`, which forwards its props) can group its rows into
nested, collapsible groups — groups → subgroups → sub-subgroups, as deep as the developer
lists. Each group header shows the group's row count. A toolbar button expands or collapses
every group at once, and each level declares whether its groups start expanded or collapsed.

## Non-goals (this cycle)

- **User-chosen grouping.** No "Group by" menu; `groupBy` is developer configuration and is
  not part of `TableState`, views, or the URL. The flat-list shape keeps that door open.
- **Grouping with paging.** Grouping and paging are mutually exclusive; grouping wins (below).
- **Group rows in export/print.** CSV, Excel and print stay flat, in grouped order.
- **Multi-membership.** A multi-valued field (multi-choice, multi-person) groups by its
  combined display text; a row never appears in two groups.
- **Branching group trees.** Every group at a level splits by the same next level; a
  per-branch subgrouping ("Active by Owner, Closed by Month") is not expressible.
- **Persisted collapse state.** Session-only, like live column resizes.

## Usage

```tsx
<SpeelEntityTable
  of={Task}
  groupBy={(p) => [
    p.Status,
    {
      key: p.Owner.key,
      collapsed: true,
      header: (g) => (
        <b>
          {g.label} · {g.count} open
        </b>
      ),
    },
    {
      key: "due",
      by: (t) => (t.DueDate && t.DueDate < new Date() ? "Overdue" : "Upcoming"),
    },
  ]}
/>
```

The callback form mirrors `columns`: `p.Status` is a `ColumnRef<T>`, type-checked against the
entity. A plain array (`groupBy={["Status", { key: "Owner" }]}`) is also accepted.

## Public API

```ts
/** One level of grouping: a column, or a computed value. */
export interface GroupDescriptor<T> {
  /** A column key; with `by`, purely the level's id (no column binding, even if it matches one). */
  key: string;
  /** The value rows are grouped on. Absent = the column's field value. */
  by?: (row: T) => unknown;
  /** The group's text. Absent = the column's display text (what search and export read). */
  label?: (value: unknown) => string;
  /** Replaces the default header. */
  header?: (group: RowGroup<T>) => ReactNode;
  /** Starting state. Absent = expanded. */
  collapsed?: boolean | ((group: RowGroup<T>) => boolean);
  /** Group order. Absent = ascending by value, blanks last. */
  order?: "asc" | "desc" | ((a: unknown, b: unknown) => number);
}

export type GroupSpec<T> = string | ColumnRef<T> | GroupDescriptor<T>;

/** What `header` and `collapsed` are handed. */
export interface RowGroup<T> {
  /** Stable path id, e.g. "Status=Active/Owner=Jane Doe". */
  id: string;
  /** 0 = the outermost level. */
  level: number;
  value: unknown;
  label: string;
  /** Matched rows under this group, across every subgroup. */
  count: number;
  rows: readonly T[];
  parent?: RowGroup<T>;
}
```

New on `SpeelTableProps<T>`:

```ts
/** Groups the rows, outermost level first. Takes precedence over `pageSize`. */
groupBy?: GroupSpec<T>[] | ((p: ColumnRefs<T>) => GroupSpec<T>[]);
```

New on `SpeelTableHandle` (and forwarded by `SpeelEntityTableHandle`):
`expandAllGroups(): void` and `collapseAllGroups(): void`. `SpeelEntityTableHandle` also gains
the `exportXlsx` it is currently missing.

All new types are exported from `src/index.ts`.

## Behaviour

- **What is grouped.** The matched rows — after scope, filters and search. Groups exist only
  for values present in the matched set; an emptied group disappears. Counts are exact: every
  row is in memory (`SpeelEntityTable` loads the full query; paging was always client-side).
- **Group identity = its label text.** Rows whose values render the same text share a group,
  so two groups never look alike. A column level labels with the column's display text
  (`cellText`); a `by` level labels with `label(value)`, else the value's string form. Empty
  values form one `(blank)` group. _(My call: grouping lookups/persons/dates by raw value would
  split visually identical groups — a DateTime with a time component would group per second.)_
- **A level's value.** A `by` level: `by(row)`. A column level: the column's sort value —
  its `sortValue` override if it has one, else the field value — so a masked column groups on
  what it sorts on. A custom column with no field and no `sortValue` groups on its display
  text. This is `RowGroup.value`; where several values share one label (a masked status),
  the group's value is the first of them in level order. _(My call.)_
- **A `by` level is self-contained.** Its `key` is only an id: no column comparator, no
  `cellText` label, no header prefix, even when the key matches a column. _(My call.)_
- **Group order.** Per level, by `order`. The default ascending order compares the
  level's value with the column's comparator (`comparatorFor` in `sort.ts`, so a Choice orders
  by declared position, a date chronologically); a `by` level without a column uses the
  natural comparator. Blanks always last. The table's column sort orders rows _within_ the
  innermost groups and never reorders groups — sorting by the grouped column is a no-op on
  group order. _(My call.)_
- **Row order overall.** Grouped order: group path, then the table's sort. `matched` — and so
  `onMatchedRowsChange`, CSV, Excel and print — follow it, because export mirrors the screen.
- **Collapse state.** Held in `SpeelTable` per group id, session-only. A group id seen for the
  first time takes its level's `collapsed` default. State survives filter, search, sort and
  `reload()` changes (an id that disappears and comes back keeps its last state). Collapsing
  a parent hides its subgroups without changing their own state.
- **Header styling.** Default headers step down by level — top level dark and semibold,
  second muted and semibold, third and deeper muted and regular, every step AA-legible. A
  custom `header` is rendered as given. Skins indent only group headers; data rows sit
  flush under the column headers.
- **Expand/collapse all.** A toolbar button with an icon (`CollapseContent` / `ExploreContent`), shown whenever `groupBy` is non-empty: labelled
  "Collapse all" while any group _on screen_ (every ancestor expanded) is expanded, otherwise
  "Expand all" — so a collapsed outer level reads "Expand all" even if its hidden subgroups
  are expanded. Clicking it puts the whole table in that mode for the session: per-group
  state is cleared and the mode replaces every level's `collapsed` default, so groups that
  appear or return later (after a filter change, a reload) follow the user's last
  all-click. Individual toggles after that layer on top as usual. The handle methods are
  the same operation. _(My call.)_ Rendered by
  `SpeelTable` through `ui.Button`, so skins only ever toggle single groups.
- **Default header.** A column level: `<column header>: <label> (<count>)`. A `by` level:
  `<label> (<count>)`. A custom `header` replaces the whole text, count included — the skin
  never appends a count of its own.
- **Grouping beats paging.** With a non-empty `groupBy`, `pageSize` (prop or `TableState`) is
  ignored: every matched row is handed to the skin and the pager is hidden; the footer still
  shows the row count. `TableState.page`/`pageSize` are left untouched, so removing `groupBy`
  restores paging where it was. When a page size is in effect, a one-time console warning per
  mount says `groupBy takes precedence over pageSize; paging is off while grouped.`
- **Group ids.** Path segments `key=label` joined by `/`, with `/`, `=` and `\` escaped in
  labels.
- **Key validation.** A level without `by` resolves its key like a sort key — a resolved column
  (hidden ones included), else an entity field. A key that resolves to nothing throws at mount:
  `groupBy` is developer-authored, so a miss is a bug (as with `FilterOrigin` "throw"). Grouping
  by a column the user has hidden keeps working. Keys are re-validated whenever the `groupBy`
  keys change, not only at mount.
- **Empty table.** No groups, the usual `emptyMessage`, no expand/collapse button.

## Skin contract

```ts
/** One group header and the slice of `items` it covers. Rows stay flat, in grouped order. */
export interface TableGroupNode {
  id: string;
  header: ReactNode;
  /** The group's whole path as plain text ("Status: Open, Owner: Ann"): the toggle's name. */
  label: string;
  /** Rows under the group — and the length of the `items` slice it covers. */
  count: number;
  level: number;
  /** Where the group's rows start in `items`. */
  startIndex: number;
  collapsed: boolean;
  /** The header is the app's own (`header`): rendered as given, without per-level muting. */
  customHeader?: boolean;
  children?: TableGroupNode[];
}

// New on TableProps:
groups?: TableGroupNode[];
onToggleGroup?: (id: string) => void;
```

`items` always carries every matched row, collapsed groups included; skins hide the rows of
collapsed groups (Fluent `DetailsList`'s `IGroup` model, which this maps onto field for
field). Absent `groups` = today's flat table, unchanged.

- **v8 skin** (`src/fluent-v8/primitives.tsx`, `V8Table`): pass `groups` to `DetailsList`,
  render `header` as the group title, include DetailsList's group-expand and indent widths in
  the width layout (`viewport` / column resolution), suppress DetailsList's own count and its header-row
  collapse-all chevron (the toolbar button owns that), route the chevron to `onToggleGroup`.
- **shadcn skin** (`registry/src/speel-shadcn/table.tsx`, authored in the registry first,
  then `npm run sync:skin` into the sample; `check:skin` gates drift): a header row at each
  group start, indented by level, with a chevron button.
- **Fake adapter** (tests): renders group headers and honours `collapsed`, so `SpeelTable`
  behaviour is testable without a skin.

Accessibility: the group toggle is a button with `aria-expanded`, named by the group's whole
path as text ("Status: Open, Owner: Ann") so nested toggles never share a name; the v8 skin
also names the group header row with it, since that row is where keyboard focus lands.
The v8 skin gets this from DetailsList; the shadcn skin provides it. Indentation alone must not
be the only signal of depth where the skin exposes rows (`aria-level` on grid rows, or
equivalent).

## Boundaries & gotchas (to carry into the docs)

- Grouped tables are unpaged. The v8 skin virtualizes, so large sets are fine there; the
  shadcn skin renders every row, so very large grouped sets are slow in it.
- Group identity is label text: two distinct values that render identically merge.
- `groupBy` entries with fresh object identity every render are fine — collapse state is keyed
  by group id, not by the config's identity.

## Testing

- Pure grouping (new module beside `useTableState`): nesting, counts across subgroups,
  `(blank)` placement, default and custom `order`, label-text identity, row order within groups.
- `SpeelTable.grouping.test.tsx` against the fake adapter: default/`collapsed` starting state,
  toggle one, expand/collapse all (button label flips), state survives filter/search/sort,
  paging ignored + warning once, page state preserved after `groupBy` removal, matched/export
  order, bad key throws, hidden grouped column still groups, handle methods.
- v8 skin and registry skin tests: groups render, toggle calls `onToggleGroup`, collapsed rows
  hidden, `aria-expanded`.
- `samples/spfx-sample` gains a grouped table for live testing and must pass `heft build`.

## Delivery

One feature branch `feat/table-grouping`. A `minor` changeset for `@speel/react`. Docs delta at
the end of the branch: a new topic page `packages/speel-react/docs/table-grouping.md` (the four
H2s) with a README TOC line; `tables.md` gains a pointer under Capabilities.
