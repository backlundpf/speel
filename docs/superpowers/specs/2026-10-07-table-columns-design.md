# Table columns: sizing, overflow and authoring — design

Date: 2026-10-07 · Status: approved in conversation, pending written-spec review

## Goal

A table in a consuming SPFx app should read well without hand-tuning every column: header
labels break at spaces, columns start at widths that suit their field, a long value either
wraps or shows its full text on hover, a field column takes options without dropping to an
unchecked string key, a header can hold a control, and the actions column is as wide as its
buttons. One branch closes seven issues, in three groups that share the
`ColumnDescriptor` → `ResolvedColumn` → `TableColumn` path:

| Group     | Issues        | Deliverable                                                      |
| --------- | ------------- | ---------------------------------------------------------------- |
| Sizing    | #64, #62, #67 | per-kind default widths, a header-word floor, flex header layout |
| Overflow  | #63, #66      | `wrap` column option, hover title on cut-off cells               |
| Authoring | #65, #57      | `p.Field.with({...})` column refs, `headerContent`               |

## Usage

```tsx
<SpeelTable
  of={Employee}
  items={rows}
  columns={(p) => [
    p.Title,
    p.Supervisor.with({ width: 170 }),
    p.Organization.with({ wrap: true }),
    p.Notes.with({ cellTitle: false }),
    {
      key: "select",
      header: "Select",
      headerContent: <Checkbox checked={allSelected} onChange={toggleAll} />,
      width: 40,
      render: (r) => <Checkbox checked={selected.has(r.Id)} />,
    },
  ]}
  rowActions={{ onView }} // actions column sized for one button, not 170px
/>
```

## Decisions

### Column refs: `p.Field.with(options)` (#65)

| Topic       | Decision                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Proxy type  | The `columns` callback's parameter becomes `ColumnRefs<T>`: one `ColumnRef<T>` per non-function key of `T`. `p.Supervsor` still fails to compile.                                                                                                      |
| `ColumnRef` | `{ readonly key: string; with(options: ColumnOptions<T>): ColumnDescriptor<T> }`. A bare ref resolves exactly as today (`autoColumn`).                                                                                                                 |
| Options     | `ColumnOptions<T>` is every descriptor member except `key`; `ColumnDescriptor<T>` becomes `ColumnOptions<T> & { key: string }`. `render`, `sortValue`, `filterValue`, `exportValue` are typed on `T`, so `render: (r) => r.Title` needs no annotation. |
| Runtime     | The proxy's ref gains `with(opts)`, returning the plain object `{ ...opts, key }`. It carries no ref symbol, so `resolveColumns` takes it down the existing descriptor path — the "spread loses options" trap in #65 cannot occur.                     |
| Prop type   | `columns?: ColumnSpec<T>[] \| ((p: ColumnRefs<T>) => (ColumnDescriptor<T> \| ColumnRef<T>)[])`. `SpeelEntityTable` inherits it.                                                                                                                        |
| Exports     | `ColumnRef`, `ColumnRefs`, `ColumnOptions` join `ColumnSpec` / `ColumnDescriptor` in the public types.                                                                                                                                                 |
| Break       | Type-only: a callback that annotates its parameter as the entity (`(p: Project) => …`) no longer compiles; drop the annotation. Released as `minor` (0.x).                                                                                             |
| Not doing   | A `column(p.X, opts)` helper (needs inference from the surrounding array, unreliable for `render`'s row type); narrowing descriptor `key` to `keyof T` (#65 option 3).                                                                                 |

### Default widths per field kind (#64, #67)

`ResolvedColumn` gains `defaultWidth: number`, computed by a new `defaultWidthFor(config?)`
in `packages/speel-react/src/table/defaultWidth.ts`. `SpeelTable` passes it to the skin as
`TableColumn.defaultWidth` — a hint, never `width`. An authored descriptor width, a view
width, and a live drag keep winning, in today's order.

| Kind                     | Default | multi / Note / with time |
| ------------------------ | ------- | ------------------------ |
| Boolean                  | 70      | —                        |
| Number, Currency         | 90      | —                        |
| DateTime                 | 100     | 150 (`DateTime` format)  |
| Choice                   | 120     | 180 (multi)              |
| Text                     | 180     | 260 (multiline / Note)   |
| Lookup (person included) | 180     | 220 (multi)              |
| Json                     | 180     | —                        |
| Custom column (no field) | 100     | —                        |

- **Actions column (#67):** `SpeelTable` stops setting `width: 170 + n × 36`. It passes
  `defaultWidth: n × 32 + (n − 1) × 4`, where `n` counts the built-ins that are set plus
  `custom.length`.
- **Fluent v8** holds a column at `width ?? max(defaultWidth ?? 100, headerFloor)`
  (`columnBounds.ts`: `heldWidth` takes the column, not a bare width; the scroll sum in
  `V8Table` follows). `MIN_RESIZE_WIDTH` stays 40.
- **shadcn** ignores `defaultWidth`: a column without `width` keeps sizing to its content, and
  the actions column (no longer given a width) now does too.

> Superseded by `2026-10-08-table-column-layout-design.md`: shadcn now uses `defaultWidth`, the header floor and v8-style wrapping headers.

### Header floor (v8 only)

A column held at its default is never narrower than its header needs:
`longestWord + 8` (sort label padding) `+ 16` if the header renders a sort label (space +
arrow) `+ 28` if it has a filter button (24px button + 4px gap). The header font is the one
`DetailsColumn` renders the name in: semibold at `theme.fonts.medium.fontSize`, in the
theme's font family (Fluent 8.125 `DetailsColumn.styles`: root `fonts.small`, `cellName`
semibold + `fonts.medium.fontSize`). Words are measured with a cached `canvas.measureText`; where no 2D context
exists (jsdom) the measurement falls back to `characters × 0.6 × fontSize`. The floor never
applies to an authored, view, or dragged width, and a column with `headerContent` has no
floor (nothing to measure). Lives in `packages/speel-react/src/fluent-v8/headerFloor.ts`.

### Header layout: flex, break at spaces (#62)

`V8HeaderCell` drops the floated filter button for a flex row:

```
<span display:flex; align-items:flex-start; gap:4px; width:100%>
  <span flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;
        white-space:normal; overflow-wrap:normal; word-break:normal>
    sort label | plain label | headerContent
  </span>
  [filter button]
</span>
```

- The label only ever breaks at whitespace. A word wider than the label box ends in "…" —
  `text-overflow` applies per line, so this needs no per-word markup (verified in Chromium).
- Text never sits under the filter button; every line is the column minus the button.
- The sort arrow follows the last word after an ordinary space, so a word that fits but
  not with its arrow sends the arrow to the next line instead of being cut.
- `title={column.header}` stays on the label as the hover for whatever is cut off.
- `HEADER_LABEL_STYLE`'s `overflowWrap: "break-word"` goes; its doc comment and the
  `v8TableHeader.test.tsx` style assertion are rewritten to the new rule.
- shadcn's header (`truncate`, single line) is unchanged apart from `headerContent`.

### `wrap` (#63)

- `ColumnOptions.wrap?: boolean`, default `false` → `ResolvedColumn.wrap` →
  `TableColumn.wrap`.
- **v8:** `isMultiline: true` on the `IColumn` so the row grows. The cell content renders
  inside a wrapper with `white-space: normal; overflow-wrap: normal; word-break: normal;
overflow: hidden; text-overflow: ellipsis` — the header's rule: break at spaces, "…" for a
  word wider than the column (overriding Fluent's `word-break: break-word`).
- **shadcn:** a wrap column's cell gets `whitespace-normal` instead of `truncate`.
- Not doing: per-user wrapping through views or the column chooser.

### Hover title on cut-off cells (#66)

- `SpeelTable` sets `TableColumn.cellTitle = (row) => cellText(col, row)` on every data
  column unless the descriptor says `cellTitle: false` (`ColumnOptions.cellTitle?: false`).
  The actions column gets none.
- **v8:** a column with `cellTitle` or `wrap` renders its content in the wrapper above
  (single-line columns: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`).
  Columns with neither — the actions column — render raw, as today.
- **Both skins:** on `mouseenter`, if the content box overflows
  (`scrollWidth > clientWidth`) the element's `title` is set to `cellTitle(row)`, otherwise
  removed. The attribute is set on the DOM node, not through state, so a hover costs no
  render; the text is computed only then. A native `title`, matching the header labels — no
  `TooltipHost` per cell.
- The check is one exported helper, `setOverflowTitle(el, getText)`, so the registry skin
  shares it with v8 (as it already shares `useResizable`).

### `headerContent` (#57)

- `ColumnOptions.headerContent?: ReactNode` → `ResolvedColumn` → `TableColumn.headerContent`.
- Both skins render it in the label slot in place of the header text; a filter button still
  sits beside it when the column is filterable.
- `header` (string) keeps every other job: export/print header row, column chooser, filter
  chips, the filter button's "Filter X" name. A custom column with `headerContent` should
  set `header`; the docs say so.
- A `headerContent` header has no hover title — the control owns its accessible name and
  tooltip. The column header is still NAMED by `header`: v8 sets `IColumn.ariaLabel` to it,
  which Fluent puts on the `columnheader` in place of naming it from the rendered content.
- A header with `headerContent` is never a sort button — a control inside a `role="button"`
  label would sort on every click and is invalid nested interactive content. The column can
  still be sorted through `tableState` or a view.

### Adapter surface

`TableColumn` gains four optional members: `defaultWidth?: number`, `wrap?: boolean`,
`cellTitle?: (row: unknown) => string`, `headerContent?: ReactNode`. A skin that ignores them
keeps working. Implemented in the v8 skin, the registry shadcn skin (then `npm run
sync:skin` for the sample's copy), and the test `fakeAdapter` (renders `headerContent`;
exposes `wrap` / `defaultWidth` as data attributes for assertions).

## Testing

**jsdom (`@speel/react` vitest):**

- `columns.test.tsx`: `.with()` resolves as a descriptor keyed to the field (inherits header,
  sort, filter; options applied); a bare ref unchanged; `wrap` / `cellTitle` /
  `headerContent` carried to `ResolvedColumn`.
- `defaultWidth.test.ts`: the kind table, multi / Note / DateTime branches, custom → 100.
- `SpeelTable` tests: `TableColumn.defaultWidth`, `cellTitle` present unless opted out,
  actions column `defaultWidth` for 1, 3, and 3 + custom buttons and no `width`.
- `columnBounds.test.ts` / `v8TableWidths.test.tsx`: held width = authored ?? max(default,
  floor); floor ignored for authored widths; scroll sum uses held widths.
- `headerFloor.test.ts`: fallback estimate path; button / sort / padding terms.
- `tableProps.test-d.ts`: `p.Typo` is a compile error (`@ts-expect-error`); `.with({ render:
(r) => r.Title })` types `r` as the entity; `(p: Entity) =>` is rejected.

**Real layout — a new offline `layout` project in `samples/spfx-sample`'s Playwright config:**

- A fixture page renders `V8Table` (the adapter primitive, no `DbContext`) from the sample's
  installed `@speel/react`, on the sample's React 17 / Fluent 8. It is bundled with `esbuild`
  (new sample devDependency), with `react`, `react-dom` and `@fluentui/react` resolved to
  the sample's single copies. The theme's font is pinned to Liberation Sans, so canvas
  measurement and layout agree across machines; network is blocked (icon fonts don't load,
  which nothing asserts on).
- Assertions read line boxes with `Range.getClientRects()`, relational rather than
  pixel-exact:
  - a header word that fits the label box is never split; a wider one ends in "…";
  - no header text overlaps the filter button;
  - a `wrap` column breaks at spaces and its row is taller than a single-line row;
  - a defaulted Boolean column with a long header is at least its floor wide;
  - hovering a cut-off cell sets `title` to its text; hovering one that fits does not.
- Script `test:layout` (`playwright test --project=layout`); `verify` gains
  `npm --prefix samples/spfx-sample run test:layout`; CI gains a
  `playwright install --with-deps chromium` step (which also installs Liberation fonts).

**Manual, before merge:** the sample dashboard in live SharePoint — headers, default widths,
wrap, and hover titles read right with Segoe UI and the real theme.

## Docs, release

- `packages/speel-react/docs/tables.md`: Columns capability rewritten around `.with()`
  (the "override one column" example uses it), `wrap`, `cellTitle`, `headerContent`, default
  widths; the "Columns keep their widths" gotcha restated (per-kind defaults, header breaks
  at spaces, "…" + title). If the page passes 250 lines, column authoring moves to a new
  `docs/table-columns.md` with a README TOC line. Skin-author docs list the four new
  `TableColumn` members.
- One `minor` changeset (`@speel/react`; the fixed group follows).
- Visible changes for consumers: v8 columns without a width change size; the actions column
  narrows; header labels stop breaking mid-word.

## Out of scope

Content-based column sizing (#64 option 3); per-user wrap; wrapping shadcn header labels;
a `TooltipHost`-styled cell tooltip.
