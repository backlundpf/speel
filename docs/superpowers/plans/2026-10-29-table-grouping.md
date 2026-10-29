# Table Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `SpeelTable` groups its matched rows into nested, collapsible, counted groups from a flat `groupBy` list, with expand/collapse-all, and turns paging off while grouped.

**Architecture:** A pure module (`grouping.ts`) resolves `groupBy` into levels and buckets the sorted matched rows into a group tree plus a flat grouped-order row list. `useTableState` applies it after filter/search/sort, so `matched` (export, print, `onMatchedRowsChange`) is in grouped order. `SpeelTable` holds session collapse state (`useGroupCollapse.ts`), builds the skin-facing `TableGroupNode` tree, and renders the toolbar toggle. Skins render group headers over a flat `items` array (Fluent `DetailsList`'s `IGroup` model).

**Tech Stack:** React 17 typings, TypeScript (NodeNext, `.js` specifiers), vitest + Testing Library, Fluent UI v8 `DetailsList`, shadcn registry skin (Tailwind, lucide-react).

**Spec:** `docs/superpowers/specs/2026-10-29-table-grouping-design.md`

## Global Constraints

- Public repo: no consumer app/org/tenant names anywhere (code, tests, docs, commits). Use generic entities (`Task`, `Project`).
- Relative imports carry `.js`; `npm run check:node-esm` must pass.
- New `SpeelUIAdapter`/`TableProps` members go in the v8 skin, the shadcn registry skin (authored in `registry/` first, then `npm run sync:skin`), and `test/fakeAdapter.tsx`.
- Grouping beats paging; the warning text is exactly `SpeelTable: groupBy takes precedence over pageSize; paging is off while grouped.`
- Default header text: column level `<column header>: <label> (<count>)`; `by` level `<label> (<count>)`; empty label → `(blank)`.
- Toolbar toggle text: `Collapse all` / `Expand all`.
- One `minor` changeset for `@speel/react` (fixed group; no `major`).
- Docs: new topic page `packages/speel-react/docs/table-grouping.md`, exactly four H2s (What & when / Canonical example / Capabilities / Boundaries & gotchas), 100–250 lines; README TOC line `- [Grouping](docs/table-grouping.md) — read when <…>.`
- `samples/spfx-sample` must pass `heft build` (`npm --prefix samples/spfx-sample run build:check`).
- Full gate: `npm run verify` from the repo root.

**Spec deviation (my call):** `TableGroupNode` carries `count` only — no separate `rowCount`. `items` always holds every matched row, so the slice a group covers _is_ its count. The spec is updated to match in Task 3.

## Review Focus

1. A controlled `tableState` from a saved view carries `pageSize`/`page`, and `groupBy` is set → pager hidden, warning once, and the view's `page`/`pageSize` are never rewritten (no `onTableStateChange` call from grouping). Test in Task 3.
2. A filter empties a group the user collapsed, then the filter is cleared → the group comes back collapsed. Test in Task 3.
3. Labels containing `/`, `=` or `\` (`"A/B"` vs. nested `"A"`→`"B"`) → distinct group ids, no state bleed. Test in Task 1.
4. Clicking a column header while grouped → rows reorder inside groups, group order unchanged. Test in Task 3.
5. Grouping by a column the user hid in the chooser, and by a key that is an entity field with no column → both still group, with the field's display name in the header. Tests in Tasks 1 and 3.

---

### Task 1: Pure grouping module

**Files:**

- Create: `packages/speel-react/src/table/grouping.ts`
- Modify: `packages/speel-react/src/table/columns.ts` (export `columnProxy` and `isColumnRef`; no behaviour change)
- Test: `packages/speel-react/test/grouping.test.ts`

**Interfaces:**

- Consumes: `resolveColumns`, `resolveKeyTarget`, `ResolvedColumn`, `ColumnRef`, `ColumnRefs` (`columns.ts`); `cellText` (`cellText.ts`); `comparatorFor`-built `Comparator` via the column's `comparator` (`sort.ts`); `isEmptyValue` (`fieldValue.ts`).
- Produces:
  ```ts
  export interface GroupDescriptor<T> {
    key;
    by?;
    label?;
    header?;
    collapsed?;
    order?;
  } // verbatim from spec
  export type GroupSpec<T> = ColumnRef<T> | GroupDescriptor<T>;
  export interface RowGroup<T> {
    id;
    level;
    value;
    label;
    count;
    rows;
    parent?;
  } // verbatim from spec
  /** A group with its place in the grouped row list. */
  export interface GroupNode<T> extends RowGroup<T> {
    startIndex: number; // index into GroupedRows.rows
    children: GroupNode<T>[]; // empty at the innermost level
  }
  /** One resolved level. */
  export interface GroupLevel<T> {
    key: string;
    /** Column header / field display name; absent for a `by` level. Prefixes the default header. */
    title?: string;
    value: (row: T) => unknown;
    label: (row: T, value: unknown) => string; // "" = blank
    compare: (a: unknown, b: unknown) => number; // non-blank values only
    direction: "asc" | "desc";
    header?: (g: RowGroup<T>) => ReactNode;
    collapsed?: boolean | ((g: RowGroup<T>) => boolean);
  }
  export interface GroupedRows<T> {
    rows: T[];
    roots: GroupNode<T>[];
  }
  export function resolveGroupLevels<T>(
    et: EntityType,
    columns: readonly ResolvedColumn<T>[],
    groupBy: GroupSpec<T>[] | ((p: ColumnRefs<T>) => GroupSpec<T>[]),
  ): GroupLevel<T>[];
  export function groupRows<T>(
    rows: readonly T[],
    levels: readonly GroupLevel<T>[],
  ): GroupedRows<T>;
  export function groupLabel<T>(g: RowGroup<T>): string; // label, or "(blank)"
  export function defaultGroupHeader<T>(
    level: GroupLevel<T>,
    g: RowGroup<T>,
  ): string;
  ```

Resolution rules (the spec's, made exact):

- **Column level** (a `ColumnRef`, or a descriptor without `by`): find the `ResolvedColumn` with that key in `columns` (hidden ones are in the full list); if none, and `resolveKeyTarget` finds an entity field, use `resolveColumns(et, [key])[0]`. Neither → throw `SpeelTable: groupBy key '<key>' names no column or field of <EntityName>. Give it a \`by\` to group on a computed value.` `title`= column header;`label`=`descriptor.label?.(value) ?? cellText(col, row)`; `value`=`col.sortAccessor ?? (row => cellText(col, row))`; `compare`=`col.comparator ?? natural`(when`value` fell back to text, natural string compare).
- **`by` level:** `title` absent; `value` = `by`; `label` = `descriptor.label?.(value) ?? (isEmptyValue(value) ? "" : String(value))` (a `Date` → `isoDate`); `compare` = natural.
- `order`: `"asc"`/`"desc"` set `direction`; a function replaces `compare` with `direction: "asc"`.

Bucketing rules:

- Buckets are keyed by label, created in first-seen order, rows kept in input order (input is already table-sorted, so rows inside groups follow the table sort).
- A group's `value` = the minimum (by `compare`) of its rows' non-blank values; blank group (`label === ""`) has `value: undefined` and always sorts last, regardless of `direction`.
- Groups at each level sort by `value` with `compare` × direction; ties keep first-seen order.
- `id` = parent id + `/` + `esc(key)` + `=` + `esc(label)` (root: no leading `/`), where `esc` prefixes `\`, `/`, `=` with `\`.
- `rows` = grouped order (depth-first); `startIndex` points into it; `count` = number of rows under the group.

- [ ] **Step 1: Write the failing tests** in `test/grouping.test.ts`, using a `ModelBuilder` entity like `SpeelTable.paging.test.tsx` (`Task` with `Id`, `Title` text, `Status` choice `["Open","Closed","Blocked"]` display name "Status", `Owner` text, `Due` DateTime) and `resolveColumns(et, undefined)` for the columns:
  - `nests and counts`: groupBy `[p.Status, p.Owner]` over 6 rows → roots in declared-choice order `Open, Closed, Blocked` (comparator, not alphabetical); each root `count` = sum of its children's `count`; `rows` concatenates leaves depth-first; every node's `rows` equals `rows.slice(startIndex, startIndex + count)`.
  - `blank group last in both directions`: rows with `Status` undefined → a root with `label === ""`, last for `order: "asc"` and `"desc"`; `groupLabel` returns `(blank)`.
  - `keeps table order inside groups`: input pre-sorted by Title desc → each leaf's `rows` keeps that order.
  - `groups by label text`: two `Due` values on the same day, different times → one group.
  - `custom order function`: `order: (a, b) => String(b).localeCompare(String(a))` reverses.
  - `by level`: `{ key: "due", by: r => r.Due && r.Due < now ? "Overdue" : "Upcoming" }` → labels `Overdue`/`Upcoming`, `title` undefined; `defaultGroupHeader` → `"Overdue (2)"`; for a Status group → `"Status: Open (3)"`.
  - `by key matching a column is only an id`: `{ key: "Status", by: () => "x" }` → `title` undefined, label `x`.
  - `escapes ids`: Owner labels `"A/B"` and nested `"A"` under different parents produce distinct ids; `"a=b"` id contains `\=`.
  - `field key with no column`: columns resolved from `["Title"]` only, groupBy `["Status"]` → groups, `title === "Status"`.
  - `throws on an unknown key`: groupBy `["Nope"]` → throws with `groupBy key 'Nope' names no column or field`.
- [ ] **Step 2: Run** `npx vitest run test/grouping.test.ts` in `packages/speel-react` — expect FAIL (module not found).
- [ ] **Step 3: Implement** `grouping.ts` per the Interfaces and rules above; export `columnProxy`/`isColumnRef` from `columns.ts`.
- [ ] **Step 4: Run** the test file — expect PASS; then `npx tsc --noEmit -p .` — expect clean.
- [ ] **Step 5: Commit** `feat(react): pure row grouping — levels, buckets, ids`.

### Task 2: Collapse state hook

**Files:**

- Create: `packages/speel-react/src/table/useGroupCollapse.ts`
- Test: `packages/speel-react/test/useGroupCollapse.test.tsx`

**Interfaces:**

- Consumes: `GroupNode`, `GroupLevel` (Task 1).
- Produces:

  ```ts
  export interface GroupCollapse<T> {
    /** Override for this id, else the all-mode, else the level's `collapsed` default (absent = expanded). */
    isCollapsed: (g: GroupNode<T>, level: GroupLevel<T>) => boolean;
    /** Flip one group from the state it currently shows. */
    toggle: (id: string, currentlyCollapsed: boolean) => void;
    /** Clears every override and sets the all-mode. */
    setAll: (collapsed: boolean) => void;
  }
  export function useGroupCollapse<T>(): GroupCollapse<T>;
  /** "Collapse all" iff some group whose ancestors are all expanded is itself expanded. */
  export function anyVisibleExpanded<T>(
    roots: readonly GroupNode<T>[],
    collapsed: (g: GroupNode<T>) => boolean,
  ): boolean;
  ```

  State is `{ mode?: boolean; overrides: Record<string, boolean> }` in `useState`; overrides survive ids leaving and returning.

- [ ] **Step 1: Write failing tests** (`renderHook` from Testing Library): default expanded; level `collapsed: true` default; `collapsed` function receives the group; `toggle` overrides; `setAll(true)` beats a level default of `false` and clears a prior override; a later `toggle` layers over the mode; `anyVisibleExpanded` is `false` when every root is collapsed even though a child is expanded, `true` when one root is expanded.
- [ ] **Step 2: Run** `npx vitest run test/useGroupCollapse.test.tsx` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(react): session collapse state for table groups`.

### Task 3: Skin contract, fake adapter, `SpeelTable` integration

**Files:**

- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (add `TableGroupNode`; `TableProps.groups?`, `TableProps.onToggleGroup?`)
- Modify: `packages/speel-react/src/table/useTableState.ts` (option `groupLevels?: readonly GroupLevel<T>[]`; return `groups?: GroupNode<T>[]`)
- Modify: `packages/speel-react/src/table/SpeelTable.tsx` (prop `groupBy`, handle methods, toggle, warning)
- Modify: `packages/speel-react/src/table/TableToolbar.tsx` (prop `groupToggle?: { text: string; onClick: () => void }`, rendered as `ui.Button` with `appearance: "subtle"` just before the search box)
- Modify: `packages/speel-react/src/table/SpeelEntityTable.tsx` (handle gains `exportXlsx`, `expandAllGroups`, `collapseAllGroups`)
- Modify: `packages/speel-react/src/index.ts` (export types `TableGroupNode`, `GroupDescriptor`, `GroupSpec`, `RowGroup`)
- Modify: `packages/speel-react/test/fakeAdapter.tsx` (render groups)
- Modify: `docs/superpowers/specs/2026-10-29-table-grouping-design.md` (drop `rowCount`, `count` documented as the slice length)
- Test: `packages/speel-react/test/SpeelTable.grouping.test.tsx`

**Interfaces:**

- Consumes: Task 1 (`resolveGroupLevels`, `groupRows`, `groupLabel`, `defaultGroupHeader`, `GroupNode`, `GroupLevel`), Task 2 (`useGroupCollapse`, `anyVisibleExpanded`).
- Produces (skin contract, used by Tasks 4–5):
  ```ts
  export interface TableGroupNode {
    id: string;
    header: ReactNode;
    /** Plain-text name for the toggle's accessible name. */
    label: string;
    /** Rows under the group — and the length of the `items` slice it covers. */
    count: number;
    level: number;
    /** Where the group's rows start in `items`. */
    startIndex: number;
    collapsed: boolean;
    children?: TableGroupNode[];
  }
  // TableProps: groups?: TableGroupNode[]; onToggleGroup?: (id: string) => void;
  ```
  `SpeelTableProps.groupBy?: GroupSpec<T>[] | ((p: ColumnRefs<T>) => GroupSpec<T>[])`; `SpeelTableHandle.expandAllGroups/collapseAllGroups: () => void`.

Wiring decisions:

- Grouped = `groupBy` resolves to ≥1 level. `SpeelTable` resolves levels each render (`resolveGroupLevels(et, resolved, groupBy)`), so a key change re-validates.
- `useTableState`: when grouped, after the sort, `matched = groupRows(sorted, levels).rows`, `groups = roots`, `displayed = matched`, `pageCount = 1`; `page`/`pageSize` state is returned but never committed by grouping.
- `TableGroupNode.header` = `level.header?.(g) ?? defaultGroupHeader(level, g)`; `label` = `groupLabel(g)`; `collapsed` = `collapse.isCollapsed(g, level)`. `onToggleGroup(id)` looks up the node's current `collapsed` from the tree built this render.
- Toggle button shown iff grouped and `groups.length > 0`; text from `anyVisibleExpanded`; click → `setAll(text === "Collapse all")`. Handles call `setAll(false)` / `setAll(true)`.
- Footer: no `paging` when grouped.
- Warning: when grouped and the effective `pageSize` is defined, `console.warn` the exact constraint text once per mount (a `useRef` flag).
- Fake adapter: per node, a `<tr data-group-level={level}>` with one `<td colSpan>` holding `<button type="button" aria-expanded={!collapsed} aria-label={label} onClick={() => onToggleGroup?.(id)} />` then `header`; when expanded, its children's rows, or (innermost) `items.slice(startIndex, startIndex + count)` through the existing row renderer (index = position in `items`). No `groups` → unchanged output.

- [ ] **Step 1: Write failing tests** in `SpeelTable.grouping.test.tsx` (same harness as `SpeelTable.paging.test.tsx`: `Task` with `Id`, `Title`, `Status` choice `["Open","Closed"]`, `Owner` text; 12 rows):
  - `renders group headers with counts`: `groupBy={(p) => [p.Status]}` → buttons named `Open` and `Closed`, texts `Status: Open (6)`, `Status: Closed (6)`, all 12 data rows present.
  - `nests`: `[p.Status, p.Owner]` → `tr[data-group-level="1"]` rows exist under each status.
  - `starts collapsed per level`: `[{ key: "Status", collapsed: true }]` → both toggles `aria-expanded="false"`, no data rows.
  - `toggles one group`: click `Open` → its rows hidden, `Closed` rows shown.
  - `expand/collapse all`: button `Collapse all` → every toggle collapsed, button now `Expand all`; click → all expanded. With `[{ key: "Status", collapsed: true }, p.Owner]` the initial text is `Expand all`.
  - `collapse survives filtering away and back` (Review Focus 2): collapse `Open`, set `tableState` (controlled re-render) to a filter matching only `Closed`, then clear it → `Open` still `aria-expanded="false"`.
  - `paging off while grouped` (Review Focus 1): `pageSize={5}` + `groupBy` → no `Next page` button, 12 rows, `console.warn` called once with the exact text across two re-renders; controlled `tableState={{ columns: [], pageSize: 5, page: 2 }}` → `onTableStateChange` not called on mount; removing `groupBy` shows page 3.
  - `sort reorders within groups only` (Review Focus 4): click the Title header → group order unchanged, rows inside `Open` reversed on the second click.
  - `matched rows in grouped order`: `onMatchedRowsChange` receives rows grouped `Open…` then `Closed…`.
  - `groups by a hidden column` (Review Focus 5): `defaultTableState` hiding `Status` + `groupBy={["Status"]}` → headers still `Status: Open (6)`.
  - `throws on an unknown key`: `groupBy={["Nope"]}` → render throws.
  - `handle methods`: `ref.current.collapseAllGroups()` inside `act` → all collapsed; `expandAllGroups()` → all expanded.
  - `no button on an empty table`: `items={[]}` → no `Collapse all`/`Expand all`.
  - Add to `SpeelEntityTable.test.tsx`: the handle exposes `exportXlsx`, `expandAllGroups`, `collapseAllGroups` as functions.
- [ ] **Step 2: Run** `npx vitest run test/SpeelTable.grouping.test.tsx` — FAIL.
- [ ] **Step 3: Implement** the contract, fake adapter, `useTableState`, `TableToolbar`, `SpeelTable`, `SpeelEntityTable`, exports; update the spec's skin-contract block.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit -p .` in `packages/speel-react` — all PASS (existing table tests unchanged).
- [ ] **Step 5: Commit** `feat(react): groupBy on SpeelTable — grouped rows, collapse, expand/collapse all; grouping beats paging`.

### Task 4: Fluent v8 skin groups

**Files:**

- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (`V8Table`)
- Test: `packages/speel-react/test/v8TableGroups.test.tsx`

**Interfaces:**

- Consumes: `TableGroupNode`, `TableProps.groups/onToggleGroup` (Task 3).
- Produces: nothing new.

Decisions:

- Map each node to `IGroup { key: id, name: label, startIndex, count, level, isCollapsed: collapsed, children }`, rebuilt every render (DetailsList mutates `isCollapsed`; rebuilding keeps the prop authoritative).
- `groupProps`: `headerProps.onToggleCollapse: (g) => p.onToggleGroup?.(g.key)`, `headerProps.onRenderTitle` renders the node's `header` (looked up by `group.key`) so DetailsList's own `(count)` never appears, `collapseAllVisibility: CollapseAllVisibility.hidden`, `showEmptyGroups: false`.
- Width: with groups, DetailsList adds a group-expand cell and per-level indent spacers to every row and the header. Read the exact widths from the installed `@fluentui/react` (`GroupSpacer`'s `SPACER_WIDTH`, the header's group-expand width / `indentWidth`) and add `depth × spacer` to `content` (both the wrapper `width` and `viewport.width`), where depth = max level + 1. Without groups, `content` is unchanged.
- Toggle a11y comes from DetailsList's group header (`aria-expanded` on the expand button); verify it in the test rather than adding markup.

- [ ] **Step 1: Write failing tests** (render `V8Table` with `containerWidth={600}` as in `v8TableCells.test.tsx`): two root nodes, one collapsed → header titles show the `header` node text and no DetailsList `(n)` count; the collapsed group's rows absent; clicking a group's expand button calls `onToggleGroup` with its id; that button has `aria-expanded`; the table box width with groups equals the no-groups width plus the measured spacer width; no-groups render unchanged.
- [ ] **Step 2: Run** `npx vitest run test/v8TableGroups.test.tsx` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the v8 tests (`npx vitest run test/v8Table*`) — PASS.
- [ ] **Step 5: Commit** `feat(react): v8 skin renders table groups`.

### Task 5: shadcn registry skin groups

**Files:**

- Modify: `registry/src/speel-shadcn/table.tsx` (`ShadTable`)
- Test: `registry/tests/table.test.tsx`
- Sync: `samples/spfx-sample/src/components/speel/table.tsx` via `npm run sync:skin` (never hand-edit)

**Interfaces:**

- Consumes: `TableGroupNode`, `TableProps.groups/onToggleGroup` (Task 3, through the registry's `@speel/react` import).

Decisions:

- Recursive render of `TableBody` rows: a group header `TableRow` with `data-group-level`, one `TableCell colSpan={columns.length}` padded left by `level × 1.5rem`, holding a `<button type="button" aria-expanded aria-label={label}>` with lucide `ChevronRight`/`ChevronDown`, then `header`. Expanded innermost groups render `items.slice(startIndex, startIndex + count)` through the existing row markup (extract it to a local `renderRow(row, i)`; `i` = position in `items`).
- Depth is carried in text by the default header's level prefix (`Status: …`) — the "equivalent" the spec allows on a plain `<table>`.

- [ ] **Step 1: Write failing tests** in `registry/tests/table.test.tsx`: header row per node with its `header` text; collapsed node hides its rows; toggle calls `onToggleGroup(id)` and has `aria-expanded`; nested level renders inside its parent; no `groups` → unchanged.
- [ ] **Step 2: Run** `npm --prefix registry test -- table` — FAIL.
- [ ] **Step 3: Implement**, then `npm run sync:skin`.
- [ ] **Step 4: Run** `npm --prefix registry test && npm --prefix registry run typecheck && npm run check:skin` — PASS.
- [ ] **Step 5: Commit** `feat(shadcn): table group header rows`.

### Task 6: Sample, changeset, docs

**Files:**

- Modify: `samples/spfx-sample/src/webparts/projectDashboard/components/ProjectsDashboard.tsx` (group one table: the Programs table by `Customer`, or the projects table by a choice field — whichever entity field exists; `collapsed` default on the inner level if two levels fit)
- Create: `.changeset/<name>.md` — `"@speel/react": minor`, one line: `SpeelTable groupBy: nested, collapsible, counted row groups with expand/collapse all; grouping turns paging off.`
- Create: `packages/speel-react/docs/table-grouping.md`
- Modify: `packages/speel-react/README.md` (TOC line), `packages/speel-react/docs/tables.md` (a Capabilities pointer to grouping; stays ≤ 250 lines)

- [ ] **Step 1:** Add the sample grouping; run `npm --prefix samples/spfx-sample run build:check` — PASS.
- [ ] **Step 2:** Add the changeset.
- [ ] **Step 3:** Write the topic page from the spec (Capabilities: levels from columns or `by`, header/label/order/collapsed, counts, expand/collapse all + handle methods, grouped export order, grouping beats paging; Boundaries: label-text identity, unpaged shadcn cost, `by` key is only an id, collapse state is session-only, throws on unknown key). Re-verify the canonical example against `packages/speel-react/src/index.ts` exports (read it). Add the TOC line and the `tables.md` pointer.
- [ ] **Step 4:** Run `npm run verify` at the repo root — PASS.
- [ ] **Step 5: Commit** `docs(react): table grouping topic page; sample groups a table; changeset`.
