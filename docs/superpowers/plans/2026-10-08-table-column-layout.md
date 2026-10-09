# Table Column Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace both table skins' column sizing with one shared, flexbox-style width resolver: table `minWidth`/`width`/`maxWidth`, per-column basis/`grow`/`shrink`/`minWidth`/`maxWidth` with per-kind defaults, no stretched last column, dragged columns frozen — and move the shadcn skin onto it (fixed table layout, wrapping headers, horizontal scroll).

**Architecture:** Core (`@speel/react`) resolves per-kind flex defaults into `ResolvedColumn` → `TableColumn` and passes table bounds through `TableProps`. A pure `resolveColumnWidths` (CSS Flexbox §9.7 "resolve flexible lengths") plus shared skin helpers (`headerFloor`, `textMeasurer`, `toFlexColumn`, `useContainerWidth`) live in `src/table/layout/` and are exported for skins. The v8 skin feeds the resolved widths to DetailsList; the shadcn skin renders a `table-layout: fixed` table with a `<colgroup>`.

**Tech Stack:** TypeScript 5.4 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, NodeNext), React 17, Fluent UI v8 (8.125), shadcn/Tailwind v4 (registry + sample copy), vitest 1.6 + Testing Library (jsdom), Playwright + esbuild (sample `layout` project).

**Spec:** `docs/superpowers/specs/2026-10-08-table-column-layout-design.md` (second cycle; the first is `docs/superpowers/specs/2026-10-07-table-columns-design.md`).

## Global Constraints

- **Worktree:** every command runs in `/home/peter/source/repos/backlundpf/speel/.claude/worktrees/table-columns` (branch `feat/table-columns-57-62-67`, PR #68). Start every Bash session with `cd /home/peter/source/repos/backlundpf/speel/.claude/worktrees/table-columns && pwd`; use absolute paths under it. Never touch the main checkout or another worktree. Never push.
- **Public repo:** no consumer app, org, tenant or account names anywhere (code, tests, comments, commits).
- **Node ESM:** relative imports inside `packages/` carry `.js`.
- **Optional props:** `exactOptionalPropertyTypes` — never assign `undefined` to an optional member; use conditional spreads.
- **Skins:** new `TableColumn`/`TableProps` members are implemented in the v8 skin, the test `fakeAdapter`, and the registry shadcn skin (authored in `registry/src/speel-shadcn/`, then `npm --prefix registry run registry:build` + `npm run sync:skin`; never hand-edit `samples/spfx-sample/src/components/speel/`).
- **Builds before downstream use:** `npm run build -w @speel/react` before registry tests/typecheck, the sample build, or the layout tests.
- **npm installs** use `--cache "$TMPDIR/npm-cache"`.
- **Formatting:** `npx prettier --write <changed files>` before each commit.
- **Commits** end with exactly:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi
  ```
- **Per-kind flex defaults (exact):** Text single-line grow 1 / shrink 1 · Text multiline (Note) grow 2 / shrink 1 · Json grow 2 / shrink 1 · Lookup grow 1 / shrink 1 · Choice grow 1 / shrink 1 · Boolean, Number, Currency, DateTime grow 0 / shrink 0 · custom column (no field) grow 0 / shrink 0 · row actions grow 0 / shrink 0.
- **Table bounds:** `type TableLength = number | \`${number}%\``; target = `max(min(width ?? sumOfOuterBases, maxWidth ?? ∞), minWidth ?? 0)` (minWidth beats maxWidth); a percentage of a container measured as 0 counts as absent.
- **Column inputs to the resolver (exact):** `basis = width ?? max(defaultWidth ?? 100, headerFloor)`; `min = minWidth ?? min(basis, max(headerFloor, MIN_RESIZE_WIDTH))`; `max = maxWidth ?? +∞`; `grow = grow ?? 0`; `shrink = shrink ?? 0`. `MIN_RESIZE_WIDTH = 40` (also the drag floor in both skins).
- **Dragging:** a column with a session (drag) width reaches the skin with `grow: 0, shrink: 0`.
- **Header room (exact):** v8 `{ label: 8, sortArrow: 16, filterButton: 28 }`, cell padding 20; shadcn `{ label: 12, sortArrow: 18, filterButton: 36 }`, cell padding 16, header font `500 14px <container font-family>`.

## Review Focus

- **Percent bounds before the container is measured** (first render, `containerWidth` 0): the table must lay out at its bases, not at 0 or NaN, and fill once measured. Pinned in Task 1 (unit) and Task 4/6 (layout fill test after measuring).
- **A drag below an authored `minWidth`:** the column stops at its `minWidth` (a basis outside `[min, max]` is clamped first). Pinned in Task 1.
- **A column whose header is a control (`headerContent`) under `maxWidth` pressure** must not shrink below `MIN_RESIZE_WIDTH` even though its header floor is 0. Pinned in Task 3 (`toFlexColumn`).
- **The shadcn resize handle reporting a width on mount** (today it does: `reported` starts `undefined`) would freeze every column at load. Must report only real drags. Pinned in Task 6.
- **A saved/authored column width with grow > 0 in a table with no bounds** must render exactly at that width (nothing grows without spare room). Pinned in Task 1 (no bounds → bases) and Task 4 (jsdom).

---

### Task 1: The resolver

**Files:**

- Create: `packages/speel-react/src/table/layout/resolveColumnWidths.ts`
- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (add `TableLength` type, exported)
- Modify: `packages/speel-react/src/index.ts` (exports)
- Test: `packages/speel-react/test/resolveColumnWidths.test.ts` (create)

**Interfaces:**

- Produces:

  ```ts
  // adapter/SpeelUIAdapter.ts
  export type TableLength = number | `${number}%`;
  // table/layout/resolveColumnWidths.ts
  export interface FlexColumn {
    basis: number;
    grow: number;
    shrink: number;
    min: number;
    max: number;
    padding: number;
  }
  export interface TableBounds {
    minWidth?: TableLength;
    width?: TableLength;
    maxWidth?: TableLength;
  }
  export interface ColumnLayout {
    widths: number[];
    tableWidth: number;
  }
  export function resolveColumnWidths(
    columns: readonly FlexColumn[],
    bounds: TableBounds,
    containerWidth: number,
  ): ColumnLayout;
  ```

- [ ] **Step 1: Write the failing tests**

Create `packages/speel-react/test/resolveColumnWidths.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  resolveColumnWidths,
  type FlexColumn,
} from "../src/table/layout/resolveColumnWidths.js";

/** A column with no padding, no bounds and no flex unless given. */
const col = (basis: number, extra: Partial<FlexColumn> = {}): FlexColumn => ({
  basis,
  grow: 0,
  shrink: 0,
  min: 0,
  max: Number.POSITIVE_INFINITY,
  padding: 0,
  ...extra,
});

describe("resolveColumnWidths", () => {
  it("lays out at the bases when the table has no bounds — nothing grows", () => {
    const r = resolveColumnWidths([col(100, { grow: 1 }), col(50)], {}, 1000);
    expect(r).toEqual({ widths: [100, 50], tableWidth: 150 });
  });

  it("grows by weight to meet a width", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1 }), col(100, { grow: 2 }), col(50)],
      { width: 550 },
      1000,
    );
    expect(r).toEqual({ widths: [200, 300, 50], tableWidth: 550 });
  });

  it("shrinks in proportion to shrink × basis", () => {
    const r = resolveColumnWidths(
      [col(200, { shrink: 1 }), col(100, { shrink: 1 })],
      { width: 210 },
      1000,
    );
    expect(r.widths).toEqual([140, 70]);
  });

  it("freezes a column at its min and gives the rest of the shrink to the others", () => {
    const r = resolveColumnWidths(
      [col(200, { shrink: 1, min: 180 }), col(100, { shrink: 1 })],
      { width: 210 },
      1000,
    );
    expect(r.widths).toEqual([180, 30]);
  });

  it("freezes a column at its max and gives the rest of the growth to the others", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1, max: 150 }), col(100, { grow: 1 })],
      { width: 400 },
      1000,
    );
    expect(r.widths).toEqual([150, 250]);
  });

  it("lets minWidth win over a smaller maxWidth", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1 })],
      { minWidth: 300, maxWidth: 200 },
      1000,
    );
    expect(r).toEqual({ widths: [300], tableWidth: 300 });
  });

  it("resolves percentages against the container", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1 })],
      { width: "50%" },
      1000,
    );
    expect(r).toEqual({ widths: [500], tableWidth: 500 });
  });

  it("ignores a percentage until the container has been measured", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1 })],
      { minWidth: "100%" },
      0,
    );
    expect(r).toEqual({ widths: [100], tableWidth: 100 });
  });

  it("overflows the target when the minimums need more room", () => {
    const r = resolveColumnWidths(
      [col(100, { shrink: 1, min: 90 }), col(100, { shrink: 1, min: 90 })],
      { maxWidth: 100 },
      1000,
    );
    expect(r).toEqual({ widths: [90, 90], tableWidth: 180 });
  });

  it("counts padding in the table width but distributes only content width", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1, padding: 20 }), col(100, { padding: 20 })],
      { width: 300 },
      1000,
    );
    expect(r).toEqual({ widths: [160, 100], tableWidth: 300 });
  });

  it("leaves spare width empty when nothing can grow", () => {
    const r = resolveColumnWidths([col(100), col(50)], { width: 500 }, 1000);
    expect(r).toEqual({ widths: [100, 50], tableWidth: 500 });
  });

  it("keeps an inflexible (dragged) column exactly where it is", () => {
    const r = resolveColumnWidths(
      [col(60), col(100, { grow: 1, shrink: 1 })],
      { width: 400 },
      1000,
    );
    expect(r.widths).toEqual([60, 340]);
  });

  it("clamps a basis that lies outside the column's own bounds", () => {
    const r = resolveColumnWidths(
      [col(50, { min: 90 }), col(300, { max: 200 })],
      {},
      1000,
    );
    expect(r).toEqual({ widths: [90, 200], tableWidth: 290 });
  });

  it("rounds to whole pixels that add up exactly", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1 }), col(100, { grow: 1 }), col(100, { grow: 1 })],
      { width: 301 },
      1000,
    );
    expect(r.widths.every(Number.isInteger)).toBe(true);
    expect(r.widths.reduce((a, b) => a + b, 0)).toBe(301);
  });

  it("takes only part of the free space when the grow factors sum below 1", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 0.5 }), col(100)],
      { width: 300 },
      1000,
    );
    expect(r).toEqual({ widths: [150, 100], tableWidth: 300 });
  });

  it("handles a table with no columns", () => {
    expect(resolveColumnWidths([], { minWidth: 120 }, 1000)).toEqual({
      widths: [],
      tableWidth: 120,
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `packages/speel-react`): `npx vitest --run test/resolveColumnWidths.test.ts`
Expected: FAIL — cannot resolve `../src/table/layout/resolveColumnWidths.js`.

- [ ] **Step 3: Add `TableLength`**

In `packages/speel-react/src/adapter/SpeelUIAdapter.ts`, above `export interface TableColumn`:

```ts
/** A table width: pixels, or a percentage of the container the table sits in. */
export type TableLength = number | `${number}%`;
```

- [ ] **Step 4: Implement the resolver**

Create `packages/speel-react/src/table/layout/resolveColumnWidths.ts`:

```ts
import type { TableLength } from "../../adapter/SpeelUIAdapter.js";

/** One column as the resolver sees it — CSS flex item terms, in content pixels. */
export interface FlexColumn {
  /** The width the column starts from (CSS `flex-basis`), padding excluded. */
  basis: number;
  /** Share of spare width (CSS `flex-grow`). 0 = never grows. */
  grow: number;
  /** Share of a shortfall, scaled by `basis` as CSS does (`flex-shrink`). 0 = never shrinks. */
  shrink: number;
  /** Narrowest the layout may make the column. */
  min: number;
  /** Widest the layout may make the column; `Infinity` when unbounded. */
  max: number;
  /** The skin's horizontal cell padding, outside the content width. */
  padding: number;
}

/** The table's own width constraints — CSS `min-width` / `width` / `max-width`. */
export interface TableBounds {
  minWidth?: TableLength;
  width?: TableLength;
  maxWidth?: TableLength;
}

export interface ColumnLayout {
  /** Each column's content width, in whole pixels. */
  widths: number[];
  /** The table's outer width. Wider than the columns when nothing can grow into a set width;
   *  narrower than them when their minimums overflow it (the skin scrolls). */
  tableWidth: number;
}

/** A length in pixels; a percentage of the container, or nothing while it is unmeasured. */
function resolveLength(
  length: TableLength | undefined,
  container: number,
): number | undefined {
  if (length === undefined) return undefined;
  if (typeof length === "number") return length;
  if (container <= 0) return undefined;
  return (parseFloat(length) / 100) * container;
}

/** CSS clamp order: `min` wins over `max`. */
const clamp = (v: number, min: number, max: number): number =>
  Math.max(Math.min(v, max), min);

/**
 * Column widths the way CSS flexbox sizes flex items (Flexbox §9.7, "resolve the flexible
 * lengths"), so a table can be bounded and its columns can grow and shrink like CSS.
 *
 * The table's target width is `clamp(width ?? sum of bases, minWidth, maxWidth)`. The space
 * between that and the bases is handed out by `grow` (or taken back by `shrink × basis`); a
 * column that would cross its own `min`/`max` is frozen there and the remainder redistributed,
 * until nothing moves. Widths are whole pixels that add up exactly.
 */
export function resolveColumnWidths(
  columns: readonly FlexColumn[],
  bounds: TableBounds,
  containerWidth: number,
): ColumnLayout {
  const padding = columns.reduce((sum, c) => sum + c.padding, 0);
  const base = columns.map((c) => clamp(c.basis, c.min, c.max));
  const outerBases = base.reduce((sum, w) => sum + w, 0) + padding;
  const target = clamp(
    resolveLength(bounds.width, containerWidth) ?? outerBases,
    resolveLength(bounds.minWidth, containerWidth) ?? 0,
    resolveLength(bounds.maxWidth, containerWidth) ?? Number.POSITIVE_INFINITY,
  );
  const available = target - padding;
  const initialFree = available - base.reduce((sum, w) => sum + w, 0);
  const growing = initialFree > 0;
  const factor = (i: number): number => {
    const c = columns[i]!;
    return growing ? c.grow : c.shrink * base[i]!;
  };

  const size = [...base];
  const frozen = columns.map((_, i) => initialFree === 0 || factor(i) === 0);
  while (frozen.some((f) => !f)) {
    const open = columns.map((_, i) => i).filter((i) => !frozen[i]);
    const used = columns.reduce(
      (sum, _, i) => sum + (frozen[i] ? size[i]! : base[i]!),
      0,
    );
    let free = available - used;
    // Flex factors summing below 1 take only that fraction of the initial free space (CSS).
    const factorSum = open.reduce((sum, i) => sum + factor(i), 0);
    if (growing) {
      const growSum = open.reduce((sum, i) => sum + columns[i]!.grow, 0);
      if (growSum < 1 && Math.abs(initialFree * growSum) < Math.abs(free))
        free = initialFree * growSum;
    }
    const step = open.map((i) => {
      const wanted = base[i]! + free * (factor(i) / factorSum);
      return {
        i,
        wanted,
        fixed: clamp(wanted, columns[i]!.min, columns[i]!.max),
      };
    });
    const violation = step.reduce((sum, s) => sum + (s.fixed - s.wanted), 0);
    for (const { i, wanted, fixed } of step) {
      size[i] = fixed;
      // Total violation decides who freezes: all (none), min-violators (> 0), max-violators (< 0).
      if (
        violation === 0 ||
        (violation > 0 && fixed > wanted) ||
        (violation < 0 && fixed < wanted)
      )
        frozen[i] = true;
    }
  }

  const widths = roundPreservingSum(size);
  const columnsWidth = widths.reduce((sum, w) => sum + w, 0) + padding;
  return { widths, tableWidth: Math.max(Math.round(target), columnsWidth) };
}

/** Whole pixels whose sum is the rounded sum of `sizes` (largest-remainder method). */
function roundPreservingSum(sizes: readonly number[]): number[] {
  const floors = sizes.map(Math.floor);
  let missing =
    Math.round(sizes.reduce((sum, s) => sum + s, 0)) -
    floors.reduce((sum, f) => sum + f, 0);
  const byRemainder = sizes
    .map((s, i) => ({ i, r: s - Math.floor(s) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (missing <= 0) break;
    floors[i] = floors[i]! + 1;
    missing--;
  }
  return floors;
}
```

- [ ] **Step 5: Export it**

In `packages/speel-react/src/index.ts`, next to the `TableColumn` type export, add `TableLength` to the adapter type exports, and in the skin-support section (near `setOverflowTitle`):

```ts
export { resolveColumnWidths } from "./table/layout/resolveColumnWidths.js";
export type {
  FlexColumn,
  TableBounds,
  ColumnLayout,
} from "./table/layout/resolveColumnWidths.js";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest --run test/resolveColumnWidths.test.ts` (from `packages/speel-react`), then `npm test -w @speel/react`.
Expected: all PASS, tsc clean.

- [ ] **Step 7: Commit**

```bash
npx prettier --write packages/speel-react/src/table/layout/resolveColumnWidths.ts packages/speel-react/src/adapter/SpeelUIAdapter.ts packages/speel-react/src/index.ts packages/speel-react/test/resolveColumnWidths.test.ts
git add packages/speel-react/src/table/layout/resolveColumnWidths.ts packages/speel-react/src/adapter/SpeelUIAdapter.ts packages/speel-react/src/index.ts packages/speel-react/test/resolveColumnWidths.test.ts
git commit -m "feat(react): flexbox-style column width resolver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 2: Flex options, per-kind defaults, table bounds (core plumbing)

**Files:**

- Modify: `packages/speel-react/src/table/defaultWidth.ts` (add `defaultFlexFor`)
- Modify: `packages/speel-react/src/table/columns.ts` (`ColumnOptions`, `ResolvedColumn`, constructors)
- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`TableColumn`, `TableProps`)
- Modify: `packages/speel-react/src/table/SpeelTable.tsx` (props, mapping, actions column, `<ui.Table>`)
- Modify: `packages/speel-react/test/fakeAdapter.tsx` (`<th>` / `<table>` data attributes)
- Test: `packages/speel-react/test/defaultWidth.test.ts`, `packages/speel-react/test/SpeelTable.layout.test.tsx` (create)

**Interfaces:**

- Consumes: `TableLength` (Task 1).
- Produces:

  ```ts
  export function defaultFlexFor(config: FieldConfig | undefined): { grow: number; shrink: number };
  // ColumnOptions<T>, ResolvedColumn<T>, TableColumn — all optional:
  grow?: number; shrink?: number; minWidth?: number; maxWidth?: number;
  // TableProps and SpeelTableProps<T>:
  minWidth?: TableLength; width?: TableLength; maxWidth?: TableLength;
  ```

- [ ] **Step 1: Failing tests for the defaults**

Append to `packages/speel-react/test/defaultWidth.test.ts`:

```ts
import { defaultFlexFor } from "../src/table/defaultWidth.js";

describe("defaultFlexFor", () => {
  it.each([
    ["Text", cfg({ kind: "Text", multiline: false }), { grow: 1, shrink: 1 }],
    ["Note", cfg({ kind: "Text", multiline: true }), { grow: 2, shrink: 1 }],
    ["Json", cfg({ kind: "Json", multi: false }), { grow: 2, shrink: 1 }],
    ["Lookup", cfg({ kind: "Lookup", multi: true }), { grow: 1, shrink: 1 }],
    ["Choice", cfg({ kind: "Choice", multi: false }), { grow: 1, shrink: 1 }],
    ["Boolean", cfg({ kind: "Boolean" }), { grow: 0, shrink: 0 }],
    ["Number", cfg({ kind: "Number" }), { grow: 0, shrink: 0 }],
    [
      "Currency",
      cfg({ kind: "Currency", decimalPlaces: 2 }),
      { grow: 0, shrink: 0 },
    ],
    [
      "DateTime",
      cfg({ kind: "DateTime", displayFormat: "DateOnly" }),
      { grow: 0, shrink: 0 },
    ],
  ])("%s", (_name, config, flex) => {
    expect(defaultFlexFor(config)).toEqual(flex);
  });

  it("keeps a column with no field fixed", () => {
    expect(defaultFlexFor(undefined)).toEqual({ grow: 0, shrink: 0 });
  });
});
```

(Move the new import up into the file's existing import block; `cfg` is the helper already defined there.)

- [ ] **Step 2: Failing table tests**

Create `packages/speel-react/test/SpeelTable.layout.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Notes?: string;
  Done?: boolean;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
      b.property((e) => e.Notes).isNote();
      b.property((e) => e.Done).isBoolean();
    });
  }
}
function wrap(node: JSX.Element) {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      {node}
    </SpeelProvider>,
  );
}
const rows = [
  Object.assign(new Task(), { Id: 1, Title: "A", Notes: "n", Done: true }),
];
const th = (c: HTMLElement, i: number): HTMLElement =>
  c.querySelectorAll<HTMLElement>("th")[i]!;

describe("SpeelTable column layout", () => {
  it("hands each column its kind's grow and shrink", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title", "Notes", "Done"]}
      />,
    );
    expect([
      th(container, 0).dataset["grow"],
      th(container, 0).dataset["shrink"],
    ]).toEqual(["1", "1"]);
    expect([
      th(container, 1).dataset["grow"],
      th(container, 1).dataset["shrink"],
    ]).toEqual(["2", "1"]);
    expect([
      th(container, 2).dataset["grow"],
      th(container, 2).dataset["shrink"],
    ]).toEqual(["0", "0"]);
  });

  it("lets a column override grow, shrink, minWidth and maxWidth", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={(p) => [
          p.Title.with({ grow: 0, shrink: 3, minWidth: 90, maxWidth: 160 }),
        ]}
      />,
    );
    const h = th(container, 0);
    expect([
      h.dataset["grow"],
      h.dataset["shrink"],
      h.dataset["minWidth"],
      h.dataset["maxWidth"],
    ]).toEqual(["0", "3", "90", "160"]);
  });

  it("keeps custom and actions columns fixed", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "x", header: "X", render: () => "x" }]}
        rowActions={{ onView: () => undefined }}
      />,
    );
    expect(th(container, 0).dataset["grow"]).toBe("0");
    expect(th(container, 1).dataset["grow"]).toBe("0");
    expect(th(container, 1).dataset["shrink"]).toBe("0");
  });

  it("passes the table's bounds to the skin", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title"]}
        minWidth="100%"
        width={900}
        maxWidth={1200}
      />,
    );
    const table = container.querySelector<HTMLElement>("table")!;
    expect([
      table.dataset["minWidth"],
      table.dataset["width"],
      table.dataset["maxWidth"],
    ]).toEqual(["100%", "900", "1200"]);
  });

  it("freezes a column the user has dragged", () => {
    const { container, getByRole } = wrap(
      <SpeelTable of={Task} items={rows} columns={["Title", "Notes"]} />,
    );
    fireEvent.click(getByRole("button", { name: "Resize Title" }));
    expect(th(container, 0).dataset["width"]).toBe("250");
    expect([
      th(container, 0).dataset["grow"],
      th(container, 0).dataset["shrink"],
    ]).toEqual(["0", "0"]);
    expect(th(container, 1).dataset["grow"]).toBe("2");
  });
});
```

(The fake adapter's resize button reports width 250 for the clicked column.)

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest --run test/defaultWidth.test.ts test/SpeelTable.layout.test.tsx`
Expected: FAIL — `defaultFlexFor` missing; data attributes undefined.

- [ ] **Step 4: Implement `defaultFlexFor`**

In `packages/speel-react/src/table/defaultWidth.ts`, append:

```ts
const FIXED = { grow: 0, shrink: 0 } as const;
const FLEX = { grow: 1, shrink: 1 } as const;
/** Content-heavy kinds take twice the spare width. */
const ROOMY = { grow: 2, shrink: 1 } as const;

/**
 * How a column of this kind flexes when its table has spare width or too little: text-like
 * columns grow and shrink, Yes/No, numbers and dates hold their width, and a column with no
 * field behind it holds too — nothing says what it contains.
 */
export function defaultFlexFor(config: FieldConfig | undefined): {
  grow: number;
  shrink: number;
} {
  if (!config) return { ...FIXED };
  switch (config.kind) {
    case "Text":
      return { ...(config.multiline ? ROOMY : FLEX) };
    case "Json":
      return { ...ROOMY };
    case "Lookup":
    case "Choice":
      return { ...FLEX };
    case "Boolean":
    case "Number":
    case "Currency":
    case "DateTime":
      return { ...FIXED };
  }
}
```

- [ ] **Step 5: Carry the options through `ResolvedColumn`**

In `packages/speel-react/src/table/columns.ts`:

- `ColumnOptions<T>` — after `width?: number;` add:
  ```ts
  /** Share of a table's spare width (CSS `flex-grow`). Defaults by field kind. */
  grow?: number;
  /** Share of a table's shortfall, scaled by width (CSS `flex-shrink`). Defaults by field kind. */
  shrink?: number;
  /** Narrowest the table's layout may make this column. Defaults to its header's longest word. */
  minWidth?: number;
  /** Widest the table's layout may make this column. */
  maxWidth?: number;
  ```
  and change the `width` doc comment to: `/** The column's starting width (CSS \`flex-basis\`). Defaults by field kind. */`.
- `ResolvedColumn<T>` — after `defaultWidth?: number;` add `grow?: number; shrink?: number; minWidth?: number; maxWidth?: number;` (one-line comments as above).
- Import `defaultFlexFor` alongside `defaultWidthFor`. Add a helper:
  ```ts
  /** grow/shrink from the descriptor, else the field kind's default; min/max only when given. */
  function flexFor<T>(
    config: FieldConfig | undefined,
    d?: ColumnDescriptor<T>,
  ): Pick<ResolvedColumn<T>, "grow" | "shrink" | "minWidth" | "maxWidth"> {
    const kind = defaultFlexFor(config);
    return {
      grow: d?.grow ?? kind.grow,
      shrink: d?.shrink ?? kind.shrink,
      ...(d?.minWidth !== undefined ? { minWidth: d.minWidth } : {}),
      ...(d?.maxWidth !== undefined ? { maxWidth: d.maxWidth } : {}),
    };
  }
  ```
- `autoColumn`: spread `...flexFor<T>(field.config)` after `defaultWidth`. `descriptorColumn`'s `base`: `...flexFor<T>(field?.config, d)`. Both `defaultColumns` pushes: `...flexFor<T>(p.config)` / `...flexFor<T>(nav.config)`.

- [ ] **Step 6: Adapter members**

In `packages/speel-react/src/adapter/SpeelUIAdapter.ts`, `TableColumn` after `defaultWidth?`:

```ts
  /** Share of the table's spare width (CSS `flex-grow`); absent = 0. */
  grow?: number;
  /** Share of the table's shortfall, scaled by width (CSS `flex-shrink`); absent = 0. */
  shrink?: number;
  /** Narrowest the layout may make the column; absent = the skin's header floor. */
  minWidth?: number;
  /** Widest the layout may make the column; absent = unbounded. */
  maxWidth?: number;
```

`TableProps` after `onColumnResize?`:

```ts
  /** The table's width bounds (CSS `min-width` / `width` / `max-width`). With none, the table
   *  is exactly as wide as its columns. */
  minWidth?: TableLength;
  width?: TableLength;
  maxWidth?: TableLength;
```

- [ ] **Step 7: `SpeelTable`**

In `packages/speel-react/src/table/SpeelTable.tsx`:

- Import `TableLength` with the adapter types. Add to `SpeelTableProps<T>` after `columns`:
  ```ts
  /** Bounds on the table's width — px or a percentage of its container, as in CSS. With none,
   *  the table is exactly as wide as its columns; `minWidth: "100%"` fills the container. */
  minWidth?: TableLength;
  width?: TableLength;
  maxWidth?: TableLength;
  ```
  and destructure `minWidth, width, maxWidth` in `SpeelTableInner`.
- In the `tableColumns` map, after the `defaultWidth` spread:
  ```tsx
    // A column the user has dragged stays where they let go; the others flex around it.
    ...(sessionWidths[c.key] !== undefined
      ? { grow: 0, shrink: 0 }
      : {
          ...(c.grow !== undefined ? { grow: c.grow } : {}),
          ...(c.shrink !== undefined ? { shrink: c.shrink } : {}),
        }),
    ...(c.minWidth !== undefined ? { minWidth: c.minWidth } : {}),
    ...(c.maxWidth !== undefined ? { maxWidth: c.maxWidth } : {}),
  ```
- The actions column: add `grow: 0, shrink: 0,` next to its `defaultWidth`.
- On `<ui.Table ...>` add:

  ```tsx
        {...(minWidth !== undefined ? { minWidth } : {})}
        {...(width !== undefined ? { width } : {})}
        {...(maxWidth !== undefined ? { maxWidth } : {})}
  ```

- [ ] **Step 8: Fake adapter**

In `packages/speel-react/test/fakeAdapter.tsx`, destructure `minWidth, width, maxWidth` in `Table`, put `data-min-width={minWidth} data-width={width} data-max-width={maxWidth}` on the `<table>`, and on each `<th>` add `data-grow={c.grow} data-shrink={c.shrink} data-min-width={c.minWidth} data-max-width={c.maxWidth}`.

- [ ] **Step 9: Run the tests**

Run: `npm test -w @speel/react`
Expected: all PASS (existing width-hint tests included).

- [ ] **Step 10: Commit**

```bash
npx prettier --write packages/speel-react/src/table/defaultWidth.ts packages/speel-react/src/table/columns.ts packages/speel-react/src/adapter/SpeelUIAdapter.ts packages/speel-react/src/table/SpeelTable.tsx packages/speel-react/test/fakeAdapter.tsx packages/speel-react/test/defaultWidth.test.ts packages/speel-react/test/SpeelTable.layout.test.tsx
git add <the same files>
git commit -m "feat(react): column grow/shrink/min/max with per-kind defaults; table width bounds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 3: Shared skin helpers

**Files:**

- Create: `packages/speel-react/src/table/layout/headerFloor.ts` (moved from `src/fluent-v8/headerFloor.ts`, generalised)
- Create: `packages/speel-react/src/table/layout/columnFlex.ts` (`MIN_RESIZE_WIDTH`, `toFlexColumn`)
- Create: `packages/speel-react/src/table/layout/useContainerWidth.ts`
- Delete: `packages/speel-react/src/fluent-v8/headerFloor.ts`
- Modify: `packages/speel-react/src/fluent-v8/columnBounds.ts` (import `MIN_RESIZE_WIDTH`, drop `heldWidth`)
- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (imports; `V8_HEADER_ROOM`; `useContainerWidth`; held widths via `toFlexColumn` basis — behaviour unchanged this task)
- Modify: `packages/speel-react/src/index.ts` (exports)
- Test: move `packages/speel-react/test/headerFloor.test.ts` to the new module and room parameter; `packages/speel-react/test/columnFlex.test.ts` (create); update `packages/speel-react/test/columnBounds.test.ts` (drop `heldWidth` cases)

**Interfaces:**

- Produces (all exported from `@speel/react`):

  ```ts
  export interface HeaderRoom {
    label: number;
    sortArrow: number;
    filterButton: number;
  }
  export function headerFloor(
    column: TableColumn,
    sortLabel: boolean,
    measure: (text: string) => number,
    room: HeaderRoom,
  ): number;
  export function textMeasurer(
    font: string,
    fontSizePx: number,
  ): (text: string) => number;
  export const MIN_RESIZE_WIDTH = 40;
  export function toFlexColumn(
    column: TableColumn,
    floor: number,
    padding: number,
  ): FlexColumn;
  export function useContainerWidth(ref: React.RefObject<HTMLElement>): number;
  ```

- [ ] **Step 1: Failing tests**

`packages/speel-react/test/headerFloor.test.ts`: change the import to `../src/table/layout/headerFloor.js`, define `const room = { label: 8, sortArrow: 16, filterButton: 28 };`, pass `room` as the 4th argument everywhere, and replace the constants `SORT_LABEL_PADDING`/`SORT_ARROW_ROOM`/`FILTER_BUTTON_ROOM` in expectations with `room.label`/`room.sortArrow`/`room.filterButton`. Add:

```ts
it("uses the skin's own room", () => {
  const shad = { label: 12, sortArrow: 18, filterButton: 36 };
  expect(headerFloor(column(filter), true, measure, shad)).toBe(
    100 + 12 + 18 + 36,
  );
});
```

Create `packages/speel-react/test/columnFlex.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MIN_RESIZE_WIDTH,
  toFlexColumn,
} from "../src/table/layout/columnFlex.js";
import type { TableColumn } from "../src/adapter/SpeelUIAdapter.js";

const column = (extra: Partial<TableColumn>): TableColumn => ({
  key: "k",
  header: "H",
  render: () => "",
  ...extra,
});

describe("toFlexColumn", () => {
  it("starts a column with no width at its default, raised to the header floor", () => {
    expect(toFlexColumn(column({ defaultWidth: 70 }), 136, 20).basis).toBe(136);
    expect(toFlexColumn(column({ defaultWidth: 180 }), 60, 20).basis).toBe(180);
    expect(toFlexColumn(column({}), 0, 20).basis).toBe(100);
  });

  it("starts an authored width as given, even under the floor", () => {
    expect(
      toFlexColumn(column({ width: 60, defaultWidth: 180 }), 136, 20).basis,
    ).toBe(60);
  });

  it("lets the layout squeeze a column to its header floor, never below the drag floor", () => {
    expect(toFlexColumn(column({ defaultWidth: 180 }), 90, 20).min).toBe(90);
    expect(
      toFlexColumn(column({ defaultWidth: 180, headerContent: "x" }), 0, 20)
        .min,
    ).toBe(MIN_RESIZE_WIDTH);
    expect(toFlexColumn(column({ width: 30 }), 0, 20).min).toBe(30);
  });

  it("takes explicit flex members, defaulting to a fixed, unbounded column", () => {
    expect(toFlexColumn(column({ defaultWidth: 100 }), 0, 16)).toEqual({
      basis: 100,
      grow: 0,
      shrink: 0,
      min: MIN_RESIZE_WIDTH,
      max: Number.POSITIVE_INFINITY,
      padding: 16,
    });
    expect(
      toFlexColumn(
        column({
          defaultWidth: 100,
          grow: 2,
          shrink: 1,
          minWidth: 80,
          maxWidth: 300,
        }),
        0,
        16,
      ),
    ).toMatchObject({ grow: 2, shrink: 1, min: 80, max: 300 });
  });
});
```

`packages/speel-react/test/columnBounds.test.ts`: delete the `describe("heldWidth", …)` block and the `heldWidth` import; keep the `columnBounds` tests.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest --run test/headerFloor.test.ts test/columnFlex.test.ts test/columnBounds.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Move and generalise `headerFloor`**

Create `packages/speel-react/src/table/layout/headerFloor.ts` with the body of `src/fluent-v8/headerFloor.ts`, changed as follows: delete the three exported constants; add

```ts
/** What a skin's header puts around its label text, in pixels. */
export interface HeaderRoom {
  /** Horizontal padding of the (sort) label. */
  label: number;
  /** A space and the sort arrow after the last word. */
  sortArrow: number;
  /** The filter button and the gap before it. */
  filterButton: number;
}
```

and give `headerFloor` a 4th parameter `room: HeaderRoom`, using `room.filterButton`, `room.label`, `room.sortArrow` where the constants were. Update its doc comment ("…plus what the skin's header puts around it…"). Keep `textMeasurer` unchanged. Delete `src/fluent-v8/headerFloor.ts`.

- [ ] **Step 4: `columnFlex.ts`**

Create `packages/speel-react/src/table/layout/columnFlex.ts`:

```ts
import type { TableColumn } from "../../adapter/SpeelUIAdapter.js";
import type { FlexColumn } from "./resolveColumnWidths.js";

/** How narrow a user may drag a column, and the least the layout ever squeezes one to. */
export const MIN_RESIZE_WIDTH = 40;

/** The width of a column with neither a width nor a default of its own. */
const DEFAULT_BASIS = 100;

/**
 * One skin column as the resolver's flex item. A column with no width starts at its field
 * kind's default raised to its header floor, so its longest header word fits; an authored,
 * view or dragged width starts as given. Layout squeezes a column no further than its header
 * floor (never below the drag floor), unless the column sets its own `minWidth`.
 */
export function toFlexColumn(
  column: TableColumn,
  floor: number,
  padding: number,
): FlexColumn {
  const basis =
    column.width ?? Math.max(column.defaultWidth ?? DEFAULT_BASIS, floor);
  return {
    basis,
    grow: column.grow ?? 0,
    shrink: column.shrink ?? 0,
    min: column.minWidth ?? Math.min(basis, Math.max(floor, MIN_RESIZE_WIDTH)),
    max: column.maxWidth ?? Number.POSITIVE_INFINITY,
    padding,
  };
}
```

- [ ] **Step 5: `useContainerWidth.ts`**

Create `packages/speel-react/src/table/layout/useContainerWidth.ts` by lifting `V8Table`'s measuring effect:

```ts
import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * The client width of `ref`'s element, kept current with a ResizeObserver (window `resize`
 * where there is none). 0 until measured — and always in jsdom, which has no layout.
 */
export function useContainerWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = (): void => setWidth(el.clientWidth);
    read();
    const RO = (
      window as unknown as {
        ResizeObserver?: new (cb: () => void) => {
          observe: (target: Element) => void;
          disconnect: () => void;
        };
      }
    ).ResizeObserver;
    if (!RO) {
      window.addEventListener("resize", read);
      return () => window.removeEventListener("resize", read);
    }
    const observer = new RO(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
```

- [ ] **Step 6: v8 uses the moved helpers — behaviour unchanged**

In `packages/speel-react/src/fluent-v8/columnBounds.ts`: replace the local `MIN_RESIZE_WIDTH` with `import { MIN_RESIZE_WIDTH } from "../table/layout/columnFlex.js";` plus `export { MIN_RESIZE_WIDTH };` (existing importers keep working), delete `DEFAULT_WIDTH` and `heldWidth`, and change `columnBounds`'s doc to speak of "the resolved width".

In `packages/speel-react/src/fluent-v8/primitives.tsx`:

- imports: `import { headerFloor, textMeasurer, type HeaderRoom } from "../table/layout/headerFloor.js";`, `import { toFlexColumn } from "../table/layout/columnFlex.js";`, `import { useContainerWidth } from "../table/layout/useContainerWidth.js";`; `columnBounds` only from `./columnBounds.js`.
- `const V8_HEADER_ROOM: HeaderRoom = { label: 8, sortArrow: 16, filterButton: 28 };` near `CELL_PADDING`, with a comment naming each source (sort label `padding: 2px 4px`, space + 12px arrow, 24px filter button + 4px gap).
- Replace the `measured` state + `useLayoutEffect` in `V8Table` with `const measured = useContainerWidth(wrapper);` (keep the `wrapper` ref and the comment about measuring).
- Replace the `held` computation with `toFlexColumn(c, headerFloor(c, sortLabel, measure, V8_HEADER_ROOM), CELL_PADDING).basis` per column (same values as today's `heldWidth`). Everything else unchanged in this task.

- [ ] **Step 7: Exports**

In `packages/speel-react/src/index.ts` (skin-support section):

```ts
export { headerFloor, textMeasurer } from "./table/layout/headerFloor.js";
export type { HeaderRoom } from "./table/layout/headerFloor.js";
export { MIN_RESIZE_WIDTH, toFlexColumn } from "./table/layout/columnFlex.js";
export { useContainerWidth } from "./table/layout/useContainerWidth.js";
```

- [ ] **Step 8: Run everything**

Run: `npm test -w @speel/react`, then `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`.
Expected: all PASS; the layout suite is unchanged (14 passed) — this task changes no behaviour.

- [ ] **Step 9: Commit**

```bash
npx prettier --write packages/speel-react/src packages/speel-react/test
git add -A packages/speel-react
git commit -m "refactor(react): shared table layout helpers — headerFloor, textMeasurer, toFlexColumn, useContainerWidth

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

(`git add -A packages/speel-react` picks up the deleted `fluent-v8/headerFloor.ts`; check `git status` shows only intended files.)

---

### Task 4: v8 lays out through the resolver

**Files:**

- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (`V8Table`)
- Modify: `packages/speel-react/test/v8TableWidths.test.tsx`
- Modify: `samples/spfx-sample/tests/layout/fixture.tsx`, `samples/spfx-sample/tests/layout/tableLayout.spec.ts`

**Interfaces:**

- Consumes: `resolveColumnWidths`, `toFlexColumn`, `headerFloor`, `useContainerWidth` (Tasks 1, 3); `TableProps.minWidth/width/maxWidth`, `TableColumn.grow/shrink/minWidth/maxWidth` (Task 2).

- [ ] **Step 1: Failing jsdom tests**

In `packages/speel-react/test/v8TableWidths.test.tsx`:

- Replace the test `"still fills the container when the held widths fit inside it"` with:
  ```tsx
  it("does not stretch the last column into spare width", () => {
    const { container } = render(
      <V8Table
        columns={cols([200, 300])}
        items={items}
        containerWidth={1000}
      />,
    );
    expect(headerWidths(container)).toEqual([220, 320]);
  });

  it("fills a minWidth of 100% through the columns that grow", () => {
    const columns = cols([200, 300]).map((c, i) => ({
      ...c,
      grow: i === 0 ? 1 : 0,
    }));
    const { container } = render(
      <V8Table
        columns={columns}
        items={items}
        containerWidth={1000}
        minWidth="100%"
      />,
    );
    // 1000 − 40 padding − 500 bases = 460 spare, all to the first column.
    expect(headerWidths(container)).toEqual([680, 320]);
  });

  it("squeezes shrinking columns to meet a maxWidth", () => {
    const columns = cols([200, 300]).map((c) => ({ ...c, shrink: 1 }));
    const { container } = render(
      <V8Table
        columns={columns}
        items={items}
        containerWidth={1000}
        maxWidth={440}
      />,
    );
    // 440 − 40 padding = 400 content: a 100px shortfall split 2:3 by shrink × basis.
    expect(headerWidths(container)).toEqual([180, 260]);
  });
  ```
- Keep the other width tests; they must still pass (the overflow, floor, default-hint and drag tests).

- [ ] **Step 2: Failing layout scenarios**

In `samples/spfx-sample/tests/layout/fixture.tsx`: extend `Scenario` with optional `bounds?: { minWidth?: TableLength; width?: TableLength; maxWidth?: TableLength }` (import `TableLength` type from `@speel/react`), spread `{...s.bounds}` onto `<V8Table>`, and append:

```tsx
  {
    name: "no-stretch",
    containerWidth: 1200,
    columns: [
      col("a", "Title", { width: 150, grow: 1, shrink: 1, sortable: true, headerFilter: filter }),
      col("b", "Modified", { width: 120, sortable: true, headerFilter: filter }),
    ],
    items: [{ a: "x", b: "y" }],
  },
  {
    name: "fill",
    containerWidth: 1200,
    bounds: { minWidth: "100%" },
    columns: [
      col("a", "Title", { width: 150, grow: 1, shrink: 1 }),
      col("b", "Notes", { width: 150, grow: 2, shrink: 1 }),
      col("c", "Done", { width: 70 }),
    ],
    items: [{ a: "x", b: "y", c: "z" }],
  },
  {
    name: "squeeze",
    containerWidth: 1200,
    bounds: { maxWidth: 400 },
    columns: [
      col("a", "Title", { width: 300, grow: 1, shrink: 1 }),
      col("b", "Notes", { width: 300, grow: 2, shrink: 1 }),
      col("c", "Done", { width: 70 }),
    ],
    items: [{ a: "x", b: "y", c: "z" }],
  },
```

In `samples/spfx-sample/tests/layout/tableLayout.spec.ts` add:

```ts
test.describe("table bounds", () => {
  test("without bounds the last column keeps its width", async ({ page }) => {
    await open(page);
    const cells = headerCells(scenario(page, "no-stretch"));
    expect(await widthOf(cells.nth(1))).toBeCloseTo(140, 0); // 120 + 20 padding
    const table = scenario(page, "no-stretch").locator(".ms-DetailsList");
    expect(await widthOf(table)).toBeLessThan(1200);
  });

  test("minWidth 100% fills the container through the growers only", async ({
    page,
  }) => {
    await open(page);
    const cells = headerCells(scenario(page, "fill"));
    const [a, b, c] = [
      await widthOf(cells.nth(0)),
      await widthOf(cells.nth(1)),
      await widthOf(cells.nth(2)),
    ];
    expect(a + b + c).toBeCloseTo(1200, 0);
    expect(c).toBeCloseTo(90, 0); // Done holds 70 + 20
    // Notes gets twice Title's share of the spare width (±1px each for whole-pixel rounding).
    expect(Math.abs(b - 170 - 2 * (a - 170))).toBeLessThanOrEqual(2);
  });

  test("maxWidth squeezes the shrinking columns and holds the rest", async ({
    page,
  }) => {
    await open(page);
    const cells = headerCells(scenario(page, "squeeze"));
    const [a, b, c] = [
      await widthOf(cells.nth(0)),
      await widthOf(cells.nth(1)),
      await widthOf(cells.nth(2)),
    ];
    expect(a + b + c).toBeCloseTo(400, 0);
    expect(c).toBeCloseTo(90, 0);
  });
});
```

**Drag scenario.** The fixture renders the adapter table, not `SpeelTable`, so add a small stateful wrapper to `fixture.tsx` that plays `SpeelTable`'s part of the drag contract:

```tsx
/** What SpeelTable does with a drag: the column gets the dragged width and stops flexing. */
function Dragging(props: {
  columns: TableColumn[];
  items: Row[];
  bounds?: Scenario["bounds"];
}): JSX.Element {
  const [dragged, setDragged] = React.useState<Record<string, number>>({});
  const columns = props.columns.map((c) =>
    dragged[c.key] !== undefined
      ? { ...c, width: dragged[c.key]!, grow: 0, shrink: 0 }
      : c,
  );
  return (
    <V8Table
      columns={columns}
      items={props.items}
      onSortChange={() => undefined}
      onColumnResize={(key, width) =>
        setDragged((d) => ({ ...d, [key]: width }))
      }
      {...props.bounds}
    />
  );
}
```

Give `Scenario` an optional `drag?: true`, render `<Dragging …/>` instead of `<V8Table …/>` for such scenarios, and append:

```tsx
  {
    name: "drag",
    containerWidth: 1200,
    drag: true,
    bounds: { minWidth: "100%" },
    columns: [
      col("a", "Title", { width: 300, grow: 1, shrink: 1 }),
      col("b", "Notes", { width: 300, grow: 1, shrink: 1 }),
    ],
    items: [{ a: "x", b: "y" }],
  },
```

and the test:

```ts
test("a dragged column stays where it is dropped; the growers fill around it", async ({
  page,
}) => {
  await open(page);
  const s = scenario(page, "drag");
  const cells = headerCells(s);
  const before = await widthOf(cells.nth(0));
  const sizer = s.locator('[data-sizer-index="0"]');
  const box = (await sizer.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  const after = await widthOf(cells.nth(0));
  expect(after).toBeLessThan(before - 100); // the drag took
  const b = await widthOf(cells.nth(1));
  expect(after + b).toBeCloseTo(1200, 0); // still fills: Notes grew into the freed width
});
```

(If Fluent's sizer needs the pointer to start exactly on its hit area, adjust the start point — never the assertions.)

Also update the comment in the existing `"columns hold their authored widths"` test (the last column no longer stretches; its width is now exactly 140) and tighten its second assertion to `toBeCloseTo(140, 0)`.

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest --run test/v8TableWidths.test.tsx` (from `packages/speel-react`) and `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`.
Expected: the new jsdom tests FAIL (last column stretched / bounds ignored); the new layout tests FAIL.

- [ ] **Step 4: Implement**

In `V8Table` (`packages/speel-react/src/fluent-v8/primitives.tsx`):

```tsx
const layout = resolveColumnWidths(
  p.columns.map((c) =>
    toFlexColumn(
      c,
      headerFloor(
        c,
        c.sortable === true &&
          p.onSortChange !== undefined &&
          c.headerContent === undefined,
        measure,
        V8_HEADER_ROOM,
      ),
      CELL_PADDING,
    ),
  ),
  {
    ...(p.minWidth !== undefined ? { minWidth: p.minWidth } : {}),
    ...(p.width !== undefined ? { width: p.width } : {}),
    ...(p.maxWidth !== undefined ? { maxWidth: p.maxWidth } : {}),
  },
  p.containerWidth ?? measured,
);
```

- Columns: `...columnBounds(layout.widths[i]!)`.
- `const content = layout.widths.reduce((sum, w) => sum + w + CELL_PADDING, 0);` and `viewport={{ width: content, height: 0 }}` — rewrite the `viewport` comment: the justified pass gives any width beyond the columns to the last one, so it is handed exactly the columns' total; the resolver has already decided growing, shrinking and overflow, and the DetailsList root scrolls when that total is wider than the box.
- Markup: the measured `wrapper` div stays the outer element; wrap `<DetailsList>` in `<div style={{ width: layout.tableWidth, maxWidth: "100%" }}>` so rows and borders end at the table's width.
- Remove `heldWidth`/`held` leftovers. Import `resolveColumnWidths` from `../table/layout/resolveColumnWidths.js`.

- [ ] **Step 5: Run both suites**

Run: `npm test -w @speel/react`, then `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`.
Expected: all PASS (18 layout tests).

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/speel-react/src/fluent-v8/primitives.tsx packages/speel-react/test/v8TableWidths.test.tsx samples/spfx-sample/tests/layout
git add packages/speel-react/src/fluent-v8/primitives.tsx packages/speel-react/test/v8TableWidths.test.tsx samples/spfx-sample/tests/layout
git commit -m "feat(react): v8 table lays out through the column resolver — no stretched last column; min/width/max bounds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 5: shadcn layout harness

**Files:**

- Create: `samples/spfx-sample/tests/layout/harness.ts` (shared bundling + `open`)
- Modify: `samples/spfx-sample/tests/layout/tableLayout.spec.ts` (use the harness; no behaviour change)
- Create: `samples/spfx-sample/tests/layout/shadcnFixture.tsx`
- Create: `samples/spfx-sample/tests/layout/shadcnLayout.spec.ts`
- Modify: `samples/spfx-sample/package.json` (`test:layout` builds the Tailwind CSS first)

**Interfaces:**

- Produces: `bundle(entry: string): Promise<string>` and `open(page: Page, bundle: string, css?: string): Promise<void>` in `harness.ts`; the shadcn fixture renders `section[data-scenario]` the same way, with the sample's synced `ShadTable` inside a `.speel-shadcn` wrapper.

- [ ] **Step 1: Extract the harness**

Move `singleCopies`, the esbuild call and `open` out of `tableLayout.spec.ts` into `harness.ts`:

```ts
export async function bundle(entry: string): Promise<string>; // the existing build() call, entryPoints [entry]
export async function open(page: Page, js: string, css?: string): Promise<void>;
// open(): as today, plus — when css is given — page.addStyleTag({ content: css }) before the script.
```

The esbuild call additionally maps the sample's `@/` alias: add `alias: { "@": path.join(sampleDir, "src") }` (esbuild's `alias` takes a path for a bare prefix) — if esbuild rejects `@` as an alias key, add an `onResolve` for `/^@\//` returning `path.join(sampleDir, "src", args.path.slice(2))` resolved with esbuild's own resolver (`b.resolve`) so extensions and `index` files work. `tableLayout.spec.ts` then does `let js = ""; test.beforeAll(async () => { js = await bundle(path.join(__dirname, "fixture.tsx")); });` and calls `open(page, js)`.

- [ ] **Step 2: The shadcn fixture**

Create `samples/spfx-sample/tests/layout/shadcnFixture.tsx`:

```tsx
// Bundled by shadcnLayout.spec.ts: the sample's synced shadcn table skin, styled by the sample's
// compiled Tailwind CSS (added by the spec), every scenario in its own section[data-scenario].
import * as React from "react";
import * as ReactDOM from "react-dom";
import { ShadTable } from "@/components/speel/table";
import type { TableColumn, TableLength } from "@speel/react";

type Row = Record<string, string>;
function col(
  key: string,
  header: string,
  extra: Partial<TableColumn> = {},
): TableColumn {
  return { key, header, render: (row) => (row as Row)[key] ?? "", ...extra };
}
const filter = { active: false, content: null };

interface Scenario {
  name: string;
  containerWidth: number;
  bounds?: {
    minWidth?: TableLength;
    width?: TableLength;
    maxWidth?: TableLength;
  };
  columns: TableColumn[];
  items: Row[];
}

const scenarios: Scenario[] = [
  {
    name: "basic",
    containerWidth: 1200,
    columns: [
      col("a", "Title", {
        width: 150,
        grow: 1,
        shrink: 1,
        sortable: true,
        headerFilter: filter,
      }),
      col("b", "Modified", {
        width: 120,
        sortable: true,
        headerFilter: filter,
      }),
    ],
    items: [{ a: "x", b: "y" }],
  },
];

function App(): JSX.Element {
  return (
    // The skin's scoped base styles live under .speel-shadcn; the font is pinned like the v8
    // fixture's so measurement and layout agree on every machine.
    <div
      className="speel-shadcn"
      style={{ fontFamily: "'Liberation Sans', Arial, sans-serif" }}
    >
      {scenarios.map((s) => (
        <section
          key={s.name}
          data-scenario={s.name}
          style={{ width: s.containerWidth, marginBottom: 24 }}
        >
          <ShadTable
            columns={s.columns}
            items={s.items}
            onSortChange={() => undefined}
            {...s.bounds}
          />
        </section>
      ))}
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"), () => {
  document.body.dataset["ready"] = "1";
});
```

(`ShadTable` is exported from the synced `table.tsx`; check the export name there.)

- [ ] **Step 3: The shadcn spec with a baseline test**

Create `samples/spfx-sample/tests/layout/shadcnLayout.spec.ts`:

```ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bundle, open } from "./harness";

let js = "";
let css = "";
test.beforeAll(async () => {
  js = await bundle(path.join(__dirname, "shadcnFixture.tsx"));
  css = readFileSync(
    path.resolve(__dirname, "../../lib/styles/speel-shadcn.css"),
    "utf8",
  );
});
const show = (page: Page): Promise<void> => open(page, js, css);
const scenario = (page: Page, name: string): Locator =>
  page.locator(`section[data-scenario="${name}"]`);

test("renders the shadcn table with its styles", async ({ page }) => {
  await show(page);
  const table = scenario(page, "basic").locator("table");
  await expect(table).toBeVisible();
  // Tailwind is applied: the header cells carry the skin's padding.
  const padding = await table
    .locator("th")
    .first()
    .evaluate((el) => getComputedStyle(el).paddingLeft);
  expect(padding).toBe("8px");
});
```

- [ ] **Step 4: Build the CSS before the layout run**

In `samples/spfx-sample/package.json` change `test:layout` to `npm run tailwind:build && playwright test --project=layout`.

- [ ] **Step 5: Run**

Run: `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`
Expected: the existing v8 tests still pass and the shadcn baseline passes.

- [ ] **Step 6: Commit**

```bash
npx prettier --write samples/spfx-sample/tests/layout samples/spfx-sample/package.json
git add samples/spfx-sample/tests/layout samples/spfx-sample/package.json
git commit -m "test(sample): shadcn table layout fixture; shared layout harness

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 6: shadcn skin — fixed layout through the resolver, wrapping headers, drag fix

**Files:**

- Modify: `registry/src/speel-shadcn/table.tsx`
- Modify/Test: `registry/tests/table.test.tsx`
- Regenerate: `registry/public/r/*.json`; sync: `samples/spfx-sample/src/components/speel/table.tsx`
- Modify: `samples/spfx-sample/tests/layout/shadcnFixture.tsx`, `samples/spfx-sample/tests/layout/shadcnLayout.spec.ts`

**Interfaces:**

- Consumes from `@speel/react`: `resolveColumnWidths`, `toFlexColumn`, `headerFloor`, `textMeasurer`, `useContainerWidth`, `MIN_RESIZE_WIDTH`, `type HeaderRoom`, `type TableProps`.

- [ ] **Step 1: Failing registry tests**

Append to `registry/tests/table.test.tsx`:

```tsx
describe("shadcn Table layout", () => {
  const cols = [
    { key: "a", header: "Title", width: 150, grow: 1, render: () => "x" },
    { key: "b", header: "Modified", width: 120, render: () => "y" },
  ];

  it("lays out with fixed table layout and a col per column", () => {
    const { container } = render(<T columns={cols} items={items} />);
    const table = container.querySelector("table")!;
    expect(table.style.tableLayout).toBe("fixed");
    // padding 16 per column; no bounds → exactly the bases
    expect(
      Array.from(container.querySelectorAll("col")).map((c) => c.style.width),
    ).toEqual(["166px", "136px"]);
    expect(table.style.width).toBe("302px");
  });

  it("lets header labels wrap at spaces", () => {
    const { container } = render(<T columns={cols} items={items} />);
    const th = container.querySelector("th")!;
    expect(th.className).toContain("whitespace-normal");
    expect(th.className).not.toContain("whitespace-nowrap");
  });

  it("reports no column width until the user drags", () => {
    const onColumnResize = vi.fn();
    render(<T columns={cols} items={items} onColumnResize={onColumnResize} />);
    expect(onColumnResize).not.toHaveBeenCalled();
  });
});
```

(Add `vi` to the `vitest` import.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run build -w @speel/react && npm --prefix registry test -- --run tests/table.test.tsx`
Expected: FAIL — no `table-layout`, no `<col>`, `whitespace-nowrap` present, `onColumnResize` called on mount.

- [ ] **Step 3: Implement**

In `registry/src/speel-shadcn/table.tsx`:

- Import `MIN_RESIZE_WIDTH, headerFloor, resolveColumnWidths, textMeasurer, toFlexColumn, useContainerWidth` and `type HeaderRoom` from `@speel/react`; `useMemo`/`useLayoutEffect` from react as needed.
- Constants:
  ```ts
  /** th `px-2` / td `p-2`: 8px each side. */
  const CELL_PADDING = 16;
  /** Sort button `px-1.5`; `size-3.5` arrow + `gap-1`; `ShadIconButton` `size-8` + `gap-1`. */
  const SHAD_HEADER_ROOM: HeaderRoom = {
    label: 12,
    sortArrow: 18,
    filterButton: 36,
  };
  ```
- `HeaderCell`: outer `span` → `flex w-full items-start gap-1`; the label slot becomes a box `min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-normal [overflow-wrap:normal] [word-break:normal]` holding: `headerContent` as-is; or the sort `button` styled `hover:bg-accent group rounded px-1.5 py-1 text-left` as an inline (`inline` + `[box-decoration-break:clone]`) element containing `<span title={column.header}>{column.header}</span>`, then `{" "}` and the arrow icon (`inline size-3.5 align-middle`); or a plain `<span title={column.header}>`. Keep the existing `aria-label`s and the filter popover beside the box (`shrink-0`).
- `ResizeHandle({ columnKey, width, onColumnResize })` where `width` is now the resolved content width: `useResizable({ axis: "x", min: { w: MIN_RESIZE_WIDTH }, initial: { w: width } })`; report only a change from the width it mounted with:
  ```ts
  const mounted = useRef(width);
  useEffect(() => {
    if (size.w !== undefined && size.w !== mounted.current) {
      mounted.current = size.w;
      onColumnResize(columnKey, size.w);
    }
  }, [size.w, columnKey, onColumnResize]);
  ```
  and render it with `key={`${c.key}:${layout.widths[i]}`}` so it restarts from the current width whenever the layout moves the column.
- `ShadTable`: a measured outer `div` (`ref`, `className="grid grid-cols-1"`, keep the comment); read the container's computed `font-family` once mounted (`useLayoutEffect` → state; fallback `"sans-serif"`); `const measure = textMeasurer(\`500 14px ${fontFamily}\`, 14)`; compute `layout = resolveColumnWidths(columns.map(c => toFlexColumn(c, headerFloor(c, sortLabel(c), measure, SHAD_HEADER_ROOM), CELL_PADDING)), bounds, container)`where`sortLabel(c) = c.sortable === true && p.onSortChange !== undefined && c.headerContent === undefined`and`bounds`spreads`p.minWidth/width/maxWidth` conditionally.
  - `<Table style={{ tableLayout: "fixed", width: layout.tableWidth }}>` and a `<colgroup>` of `<col style={{ width: layout.widths[i]! + CELL_PADDING }} />` per column, before `<TableHeader>`.
  - `TableHead`: `className="relative h-auto whitespace-normal align-top"`, no inline width.
  - Body `TableCell`: `cn(c.wrap ? "whitespace-normal overflow-hidden text-ellipsis [overflow-wrap:normal] [word-break:normal]" : "truncate")` — every non-wrap cell truncates now.
  - The empty-items early return is unchanged.

- [ ] **Step 4: Registry gates**

Run: `npm --prefix registry run typecheck && npm --prefix registry test`
Expected: clean; all PASS (existing smoke and table tests included).

- [ ] **Step 5: Regenerate and sync**

Run: `npx prettier --write registry/src/speel-shadcn/table.tsx registry/tests/table.test.tsx && npm --prefix registry run registry:build && npm run sync:skin && npm run check:skin`

- [ ] **Step 6: Failing → passing shadcn layout tests**

In `shadcnFixture.tsx` append scenarios:

```tsx
  {
    name: "narrow-header",
    containerWidth: 1200,
    columns: [
      col("a", "Separation Date Confirmed", { width: 60, sortable: true, headerFilter: filter }),
      col("b", "Filler", { width: 80 }),
    ],
    items: [{ a: "x", b: "y" }],
  },
  {
    name: "wide",
    containerWidth: 300,
    columns: [
      col("a", "Title", { width: 200 }),
      col("b", "Notes", { width: 200 }),
    ],
    items: [{ a: "x", b: "y" }],
  },
  {
    name: "fill",
    containerWidth: 1200,
    bounds: { minWidth: "100%" },
    columns: [
      col("a", "Title", { width: 150, grow: 1, shrink: 1 }),
      col("b", "Done", { width: 70 }),
    ],
    items: [{ a: "x", b: "y" }],
  },
```

In `shadcnLayout.spec.ts` add (reuse `lineTexts`/`wordsWhole` from `./lines`):

```ts
const widthOf = (l: Locator): Promise<number> =>
  l.evaluate((el) => el.getBoundingClientRect().width);

test("the table is as wide as its columns, not its container", async ({
  page,
}) => {
  await show(page);
  expect(await widthOf(scenario(page, "basic").locator("table"))).toBeCloseTo(
    302,
    0,
  ); // 166 + 136
});

test("a column can be narrower than its header; the header wraps at spaces and ends in …", async ({
  page,
}) => {
  await show(page);
  const th = scenario(page, "narrow-header").locator("th").first();
  expect(await widthOf(th)).toBeCloseTo(76, 0); // 60 + 16 padding
  const label = th.locator('[title="Separation Date Confirmed"]');
  const lines = await label.evaluate(lineTexts);
  expect(wordsWhole(lines, "Separation Date Confirmed")).toBe(true);
});

test("a table wider than its container scrolls sideways", async ({ page }) => {
  await show(page);
  const scroller = scenario(page, "wide").locator(
    '[data-slot="table-container"]',
  );
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
});

test("minWidth 100% fills the container through the growers", async ({
  page,
}) => {
  await show(page);
  const ths = scenario(page, "fill").locator("th");
  expect((await widthOf(ths.nth(0))) + (await widthOf(ths.nth(1)))).toBeCloseTo(
    1200,
    0,
  );
  expect(await widthOf(ths.nth(1))).toBeCloseTo(86, 0); // Done holds 70 + 16
});
```

Run: `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`
Expected: all PASS. (Write and run these BEFORE Step 3's implementation if you can — they must fail on the old auto-layout skin; record the RED output.)

- [ ] **Step 7: Sample build**

Run: `npm --prefix samples/spfx-sample run build:check` — must pass.

- [ ] **Step 8: Commit**

```bash
npx prettier --write samples/spfx-sample/tests/layout
git add registry/src/speel-shadcn/table.tsx registry/tests/table.test.tsx registry/public/r samples/spfx-sample/src/components/speel/table.tsx samples/spfx-sample/tests/layout
git commit -m "feat(registry): shadcn table lays out through the column resolver — fixed layout, wrapping headers, horizontal scroll

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 7: Docs, changeset, full gate

**Files:**

- Modify: `packages/speel-react/docs/table-columns.md`, `packages/speel-react/docs/tables.md`, `packages/speel-react/docs/skins.md`
- Modify: `.changeset/table-columns.md`
- Modify: `docs/superpowers/specs/2026-10-07-table-columns-design.md` only if a statement there is now false and misleading (e.g. "shadcn sizes to content") — add a one-line "superseded by 2026-10-08-table-column-layout-design.md" note rather than rewriting history.

- [ ] **Step 1: `table-columns.md`** — rewrite the sizing capability as "Column widths": a column starts at its basis (`width`, else its kind's default raised to the header floor); `grow`/`shrink` with the per-kind defaults in prose (text-like columns flex, Note and Json take twice the spare width, Yes/No/number/date and custom columns hold); `minWidth`/`maxWidth` per column; the table's `minWidth`/`width`/`maxWidth` in px or %; idioms `minWidth: "100%"` (fill, scroll when needed) and `maxWidth: "100%"` (fit, squeezing text columns first); a dragged column stays where it is dropped. Gotchas: v8 no longer stretches its last column (use `minWidth: "100%"`); an authored `width` is a basis, so it can grow when the table has spare width (`grow: 0` pins it); a column never drags below its own `minWidth`. Four H2s, ≤ 250 lines, canonical example re-verified against `src/index.ts`.
- [ ] **Step 2: `tables.md`** — restate the "Columns keep their widths" gotcha in one paragraph pointing at `table-columns.md`; ≤ 250 lines.
- [ ] **Step 3: `skins.md`** — the Table paragraph mentions the shared layout helpers (`resolveColumnWidths`, `toFlexColumn`, `headerFloor` with a skin's `HeaderRoom`, `useContainerWidth`) a skin uses to honour `TableProps` bounds and the column flex members, without growing past 250 lines.
- [ ] **Step 4: Changeset** — append to the body of `.changeset/table-columns.md`: "Columns flex like CSS: each has a basis (`width`) and `grow`/`shrink` weights with per-kind defaults, plus `minWidth`/`maxWidth`; tables take `minWidth`/`width`/`maxWidth` (px or % of the container) and are otherwise exactly as wide as their columns — the v8 skin no longer stretches its last column (`minWidth: "100%"` fills). The shadcn skin uses the same layout: fixed table layout, headers that wrap at spaces, horizontal scroll. `resolveColumnWidths` and the header-floor helpers are exported for skins."
- [ ] **Step 5: Gate** — `npm run format:check && npm run verify` (10-minute timeout) green.
- [ ] **Step 6: Commit** — `docs: column widths — flex bounds and grow/shrink; changeset` with the trailer lines.
