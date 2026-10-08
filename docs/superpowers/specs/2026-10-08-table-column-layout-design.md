# Table column layout: a shared flexbox-style width resolver — design

Date: 2026-10-08 · Status: approved in conversation, pending written-spec review · Branch:
`feat/table-columns-57-62-67` (second cycle; first: `2026-10-07-table-columns-design.md`)

## Goal

A live check of the first cycle found two layout gaps. The Fluent v8 table hands all spare width to
its last column, so a short last column stretches across the page and its filter button lands far
right. The shadcn table still uses the browser's automatic table layout: it is pinned to 100% of the
container, squeezes every column to fit, never lets a column be narrower than its content, and
never wraps a header.

Both skins should lay out columns the way CSS flexbox lays out items: each column has a basis and
grow/shrink weights, the table can be bounded with `minWidth` / `width` / `maxWidth`, and anything
that still does not fit scrolls. One pure resolver computes the widths and both skins render its
result, so they lay out identically.

## Usage

```tsx
<SpeelTable
  of={Project}
  items={rows}
  minWidth="100%" // fill the container; scroll when the columns need more
  columns={(p) => [
    p.Title, // Text: basis 180, grow 1
    p.Notes, // Note: basis 260, grow 2 — takes twice Title's share of spare width
    p.DueDate, // Date: holds its width
    p.Owner.with({ width: 200, grow: 0 }), // basis 200, pinned
    p.Status.with({ minWidth: 90, maxWidth: 160 }),
  ]}
/>
```

With no table bounds the table is exactly as wide as its columns' bases: nothing grows and nothing
stretches.

## Decisions

### Consumer API

| Where                                    | Member                             | Meaning                                                                                                                                                        |
| ---------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SpeelTableProps`                        | `minWidth?`, `width?`, `maxWidth?` | The table's outer width: `number` (px) or `` `${number}%` `` of the container. CSS semantics: used width = `clamp(width ?? sum of bases, minWidth, maxWidth)`. |
| `ColumnOptions` (`.with()` / descriptor) | `width?`                           | The column's **basis** (CSS `flex-basis`), as before. Absent → its kind's default.                                                                             |
|                                          | `grow?`, `shrink?`                 | Weights. Absent → its kind's default (table below).                                                                                                            |
|                                          | `minWidth?`, `maxWidth?`           | Clamp for layout-driven growing and shrinking. `minWidth` absent → the header floor, capped at the basis.                                                      |

Not stored in `tableState` or views. `SpeelEntityTable` inherits the table props.

### Defaults by field kind

| Kind                                | Basis                  | grow  | shrink |
| ----------------------------------- | ---------------------- | ----- | ------ |
| Text (single line)                  | 180                    | 1     | 1      |
| Text (multiline / Note)             | 260                    | **2** | 1      |
| Lookup, person included             | 180 / 220 multi        | 1     | 1      |
| Choice                              | 120 / 180 multi        | 1     | 1      |
| Json                                | 180                    | **2** | 1      |
| Boolean, Number, Currency, DateTime | 70 / 90 / 90 / 100–150 | 0     | 0      |
| Custom column (no field)            | 100                    | 0     | 0      |
| Row actions                         | `n × 32 + (n − 1) × 4` | 0     | 0      |

`defaultWidthFor` (first cycle) keeps the bases; a sibling `defaultFlexFor(config)` returns
`{ grow, shrink }`. Shrink is scaled by basis in the resolver (as CSS does), so wide columns already
give up more pixels; Note and Json need no separate shrink weight.

### The resolver

`resolveColumnWidths(columns, bounds, containerWidth)` in `packages/speel-react/src/table/layout/`,
exported from `@speel/react` for skins:

```ts
interface FlexColumn {
  basis: number; // content width the column starts from
  grow: number;
  shrink: number;
  min: number; // content-width clamp
  max: number; // Infinity when unbounded
  padding: number; // the skin's horizontal cell padding, outside the content width
}
interface TableBounds {
  minWidth?: TableLength;
  width?: TableLength;
  maxWidth?: TableLength;
}
type TableLength = number | `${number}%`;
function resolveColumnWidths(
  columns: readonly FlexColumn[],
  bounds: TableBounds,
  containerWidth: number,
): { widths: number[]; tableWidth: number };
```

- **Target.** Outer basis sum `S = Σ(basis + padding)`. Percentages resolve against
  `containerWidth`; when it is 0 (not yet measured, jsdom without the seam) a percentage counts as
  absent. `target = clamp(width ?? S, minWidth ?? 0, maxWidth ?? ∞)` — `minWidth` wins over
  `maxWidth` when they conflict, as in CSS.
- **Distribution** — CSS Flexbox §9.7 "resolve the flexible lengths": free space
  `target − S`; positive → distribute by `grow`; negative → by `shrink × basis`. A column whose
  share would cross its `min`/`max` is frozen at the bound and the remainder redistributed; repeat
  until stable. Columns with a zero factor keep their basis. A basis outside `[min, max]` is clamped
  first.
- **Rounding.** Whole pixels; leftover pixels go to the flexing columns with the largest fractional
  parts, so the columns sum exactly to the distributed total.
- **Result.** `widths` are content widths. `tableWidth = max(target, Σ(width + padding))`: when
  nothing can grow the spare width stays empty at the right (CSS); when minimums exceed the target
  the columns overflow it and the skin scrolls.

### Header floor, generalised

`headerFloor` moves from `fluent-v8/headerFloor.ts` to the layout module with the skin's room as a
parameter — `headerFloor(column, sortLabel, measure, room: { label: number; sortArrow: number;
filterButton: number })` — and is exported with `textMeasurer`. v8 passes today's constants
(8 / 16 / 28) and its header font; shadcn passes its own — label 12 (sort button `px-1.5`), sort
arrow 18 (`size-3.5` + `gap-1`), filter button 36 (`ShadIconButton` `size-8` + `gap-1`) — and the
font its header renders in: `500 14px` (`text-sm font-medium`) in the container's computed
`font-family`. A column's default `min` is
`min(basis, headerFloor)`; a column with `headerContent` has floor 0.

### Dragging

A column dragged in this mount is passed to the resolver with `basis` = the dragged width and
`grow = shrink = 0`, so it lands exactly where the user let go; the others flex around it within the
table's bounds (at `minWidth`, narrowing one widens the growers; at `maxWidth`, widening one
shrinks the shrinkers). `SpeelTable` already layers the session width over `width`; it now also
zeroes that column's `grow`/`shrink` before handing it to the skin. The drag floor stays 40px
(`MIN_RESIZE_WIDTH`), below the header floor by design.

### Adapter surface

- `TableProps` gains `minWidth?`, `width?`, `maxWidth?` (`TableLength`).
- `TableColumn` gains `grow?`, `shrink?`, `minWidth?`, `maxWidth?`. `SpeelTable` always sets
  `grow`/`shrink` from the kind defaults (or the descriptor, or 0 when dragged); `defaultWidth`
  remains the basis hint when `width` is absent.
- A skin that ignores the new members keeps working.

### Fluent v8

- `V8Table` keeps measuring its container and computing header floors, then calls the resolver with
  `padding = CELL_PADDING` (20) per column.
- Each `IColumn` gets `maxWidth = widths[i]`, `minWidth = min(MIN_RESIZE_WIDTH, widths[i])`
  (the existing `columnBounds` contract), and `viewport.width = Σ(widths + padding)` — the content
  total, never the container — so the justified pass has no remainder to hand the last column.
- The markup becomes an outer measuring `div` (100%) around an inner `div` of
  `width: tableWidth; max-width: 100%`; DetailsList's root (`horizontalConstrained`) scrolls inside
  it when the table is wider than the container. Rows and borders end at the table's width.
- `heldWidth` / the old `viewport = max(container, content)` logic are replaced by the resolver.

### shadcn (registry skin)

- Keeps a real `<table>` (semantics intact) with `table-layout: fixed`, `width: tableWidth`
  (inline style, overriding the primitive's `w-full`), and a `<colgroup>` giving each column
  `widths[i] + padding` (cells are border-box; `px-2` → padding 16).
- Measures its container with a `ResizeObserver` (the existing `grid grid-cols-1` wrapper stays, so
  the table cannot inflate a flex/grid parent); the primitive's `overflow-x-auto` wrapper scrolls.
- Uses `defaultWidth` and the header floor now (reverses the first cycle's "shadcn sizes to
  content").
- Header cell becomes the v8 shape: flex row, label box breaking only at spaces with `…` for an
  over-long word (`whitespace-normal [overflow-wrap:normal] [word-break:normal] overflow-hidden
text-ellipsis`, the `th`'s `whitespace-nowrap` / fixed height overridden), filter button beside
  it, `title={header}` on the text label.
- Body cells always truncate (`truncate`) unless `wrap`, which keeps `whitespace-normal`; the
  cut-off hover title is unchanged.
- `ResizeHandle` starts from the resolved width; its floor becomes `MIN_RESIZE_WIDTH` (40).
- Authored in `registry/`, regenerated JSON committed, synced to the sample by `npm run sync:skin`.

## Testing

- **Resolver unit tests** (`test/columnLayout.test.ts`): no bounds → bases; `width` above the sum →
  growth by weight (grow 2 gets twice grow 1); below → shrink scaled by basis; min/max freezing with
  redistribution; `minWidth` beats `maxWidth`; percentages against the container and ignored at 0;
  minimums exceeding the target overflow; a frozen (dragged) column keeps its width; integer
  rounding sums exactly; empty column list.
- **Defaults**: `defaultFlexFor` per kind; `SpeelTable` passes `grow`/`shrink`/`minWidth`/
  `maxWidth` and the table bounds through (fake adapter data attributes); a dragged column arrives
  with `grow = shrink = 0`.
- **v8 jsdom**: header widths for no bounds (no stretch), `minWidth: "100%"` with growers (via the
  `containerWidth` seam), `viewport` equals the content total.
- **Layout (Playwright, real Chromium)**:
  - v8: the last column is not stretched without bounds; `minWidth: "100%"` fills via growers and
    keeps non-growing columns at their basis; `maxWidth` squeezes text columns to their minimums
    and then scrolls; an existing scenario's header/wrap/hover checks still pass.
  - shadcn: a second fixture renders the sample's synced `ShadTable` with the sample's compiled
    Tailwind CSS (`lib/styles/speel-shadcn.css`, inside the skin's scoping class). Checks: the table
    is as wide as its columns (not 100%); a column can be narrower than its header text with `…`;
    headers break only at spaces; wide content scrolls horizontally; `minWidth: "100%"` fills.
  - Drag: shrinking a column at `minWidth` widens a grower; the dragged column keeps its width.

## Docs, release

- `docs/table-columns.md`: the sizing capability becomes "Column widths" — bases, grow/shrink,
  the defaults table in prose, table `minWidth`/`width`/`maxWidth` with the `minWidth: "100%"` fill
  idiom, dragging; gotcha: the v8 last column no longer stretches by default. `tables.md` and
  `skins.md` (resolver + floor helpers for skin authors) updated within their line limits.
- The existing `minor` changeset gains the layout change (one release note for the branch).

## Out of scope

Bounding the table's height; storing table bounds in `tableState`/views; per-user grow settings;
a separate shrink weighting for Note/Json; content-measured bases.
