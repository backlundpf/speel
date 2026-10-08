# Table column alignment, link buttons, tooltip anchoring — design

Date: 2026-10-08 · Status: approved in conversation, pending written-spec review · Branch:
`feat/table-columns-57-62-67` (third cycle; earlier: `2026-10-07-table-columns-design.md`,
`2026-10-08-table-column-layout-design.md`) · Issues: #70, #58

## Goal

A table column can't choose its alignment, and the only button that looks at home in a cell — the
`subtle` one — is Fluent's `ActionButton`: centered, one line, 40px tall. A row title rendered as a
subtle "open" button is clipped at its **start** when it is too long and sits lower than the text
beside it (#70). Separately, a `Button` with a `tooltip` in the v8 skin anchors the tooltip to a
host box that can be wider than the button (#58).

Deliverables:

1. `ColumnOptions.align?: "start" | "center" | "end"` — header and cells, both skins.
2. `ButtonProps.appearance: "link"` — an inline, left-aligned, end-truncating text button in both
   skins, with its full text on hover when cut off.
3. Tooltip anchoring: a button's tooltip host and the button are always the same box.

## Usage

```tsx
const ui = useSpeelUI();
<SpeelTable
  of={Template}
  items={rows}
  columns={(p) => [
    p.Title.with({
      render: (t) => (
        <ui.Button
          appearance="link"
          text={t.Title ?? ""}
          onClick={() => open(t)}
        />
      ),
    }),
    p.Owner,
    p.OpenItems.with({ align: "end" }),
  ]}
/>;
```

## Decisions

### `align` (#70, part 1)

| Topic     | Decision                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API       | `ColumnOptions.align?: "start" \| "center" \| "end"`, default `"start"` → `ResolvedColumn.align` → `TableColumn.align` (absent = start).                |
| Defaults  | No per-kind default: numbers stay `"start"` unless the column says `"end"` — existing tables do not shift.                                              |
| Vertical  | Not offered. The vertical offset in #70 came from the 40px subtle button; a link is text-height.                                                        |
| v8 header | The label box (`[data-header-label]`) gets `text-align` (start / center / end); the filter button stays beside it.                                      |
| v8 cells  | `V8Cell`'s content box gets `text-align`. A column with a non-start `align` always renders through `V8Cell` (today only `cellTitle`/`wrap` columns do). |
| shadcn    | The header label box and the `td` get `text-start` / `text-center` / `text-end` (logical values, like v8's `text-align: start / center / end`).         |
| Elsewhere | `align` does not change export, print, search or sorting.                                                                                               |

### `appearance: "link"` (#70, part 2)

| Topic      | Decision                                                                                                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API        | `ButtonProps.appearance` gains `"link"`.                                                                                                                                                                                                                                                                                                           |
| v8         | Fluent `Link` with `onClick` (renders a `<button>`), `type` passed through. Styles: `display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: top; text-align: start`. `iconName` renders a Fluent `Icon` before the text inside the link. `disabled` and `ariaLabel` pass through. |
| shadcn     | The shadcn `Button` `variant="link"` with its height and padding removed (`h-auto p-0`), `max-w-full justify-start text-left`, the label in a `truncate` span; `iconName` renders the skin's icon before the text.                                                                                                                                 |
| Truncation | Both skins truncate at the **end**: a long label shows its beginning and ends in "…". Never centered, never clipped at the start.                                                                                                                                                                                                                  |
| Hover text | On `mouseenter` the link calls `setOverflowTitle(el, () => text)` (v8: on the link element; shadcn: on the truncating span), so a cut-off link shows its full text natively. When the button has a `tooltip`, the tooltip wins and no title is set.                                                                                                |
| In a cell  | The link truncates itself, so the cell's content box never overflows and the cell's own cut-off title never fires — exactly one hover text.                                                                                                                                                                                                        |

### Tooltip anchoring (#58)

The tooltip host and the button are one box, in any container:

- **v8:** `TooltipHost` root `display: inline-block`; the button inside it fills the host
  (`width: 100%` on the button root). In a block container the host shrink-wraps the button; in a
  flex container that stretches its children the host stretches and so does the button — as a button
  without a tooltip would — and the tooltip centres on the button either way.
- **shadcn:** the existing `inline-flex` trigger span keeps its role (it makes a disabled button's
  tooltip reachable); the button inside fills it (`w-full`), with the same effect.
- No new `directionalHint` prop.

### Adapter surface

`TableColumn.align?: "start" | "center" | "end"`; `ButtonProps.appearance` gains `"link"`. Implemented
in the v8 skin, the test `fakeAdapter` (`data-align` on `th`/`td`; the link renders as a `button` with
`data-appearance="link"`), and the registry shadcn skin (then `registry:build` + `sync:skin`).

## Testing

- **jsdom (`@speel/react`):** `align` resolves from a descriptor and `.with()` and reaches the skin
  (fake adapter `data-align`); v8 header label box and cell content box carry the `text-align`; a
  non-start column without `cellTitle` still renders through `V8Cell`; `appearance: "link"` renders
  a Fluent `Link` (`.ms-Link`) as a `button` with the truncation styles; a cut-off link (stubbed
  `scrollWidth > clientWidth`) gets `title = text` on hover and a fitting one none; with `tooltip`
  no `title` is set; the `TooltipHost` root is `inline-block`.
- **registry (jsdom):** `align` classes on header label box and `td`; link variant classes and the
  truncating span; hover title; `w-full` on a tooltip-wrapped button.
- **Real layout (Playwright, both skins):**
  - a long link title in a narrow cell shows its first characters (the first character's rect lies
    inside the cell) and is cut off (`scrollWidth > clientWidth` on the truncating element); hover
    gives the full text;
  - `align: "end"`: the header label text and the cell text end within a few px of the column's
    right content edge;
  - a link in a row is no taller than a plain text cell's line box (no 40px button);
  - tooltip anchoring: a tooltip-wrapped button in a block container and in a stretching
    flex-column container — the host's rect equals the button's rect.

## Docs, release

- `docs/table-columns.md`: `align` and the "a cell that opens its row" idiom (link button) in
  Capabilities. The page is at its 250-line limit — tighten existing text to make room; stay ≤ 250.
- `docs/skins.md`: `TableColumn.align` and the `"link"` appearance in the adapter contract (≤ 250).
- Wherever the docs list `ButtonProps.appearance` values (forms / surfaces pages), add `"link"`.
- The branch's existing `minor` changeset gains: column `align`, the `"link"` button appearance, and
  tooltip anchoring.

## Out of scope

`verticalAlign`; a column `onOpen` convenience (decided against); per-kind alignment defaults;
alignment in print/export; a `directionalHint` prop.
