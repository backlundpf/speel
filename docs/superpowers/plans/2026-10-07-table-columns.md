# Table Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #57 and #62–#67: typed `p.Field.with({...})` column refs, `wrap` / `cellTitle` / `headerContent` column options, per-kind default widths with a header-word floor, a flex header that breaks only at spaces, hover titles on cut-off cells, and an actions column sized to its buttons — in `@speel/react`, its Fluent v8 skin, and the registry shadcn skin, with real-layout tests in the sample.

**Architecture:** Column options flow `ColumnOptions`/`ColumnDescriptor` → `resolveColumns` → `ResolvedColumn` → `SpeelTable` → adapter `TableColumn` → skin. Core computes hints (`defaultWidth`, `cellTitle` text via `cellText`); skins decide presentation (v8 holds widths and floors them; shadcn sizes to content). Real layout is checked by a new offline Playwright project in `samples/spfx-sample` that bundles a `V8Table` fixture with esbuild.

**Tech Stack:** TypeScript 5.4 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, NodeNext), React 17, Fluent UI v8 (8.125), vitest 1.6 + Testing Library (jsdom), Playwright (sample), esbuild, shadcn/Tailwind (registry).

**Spec:** `docs/superpowers/specs/2026-10-07-table-columns-design.md`

## Global Constraints

- **Worktree:** every command runs in `/home/peter/source/repos/backlundpf/speel/.claude/worktrees/table-columns` (branch `feat/table-columns-57-62-67`). Start every Bash session with `cd /home/peter/source/repos/backlundpf/speel/.claude/worktrees/table-columns && pwd` and use absolute paths under it for file edits. Never touch the main checkout or any other worktree.
- **Public repo:** no consumer app, org, tenant or account names anywhere (code, tests, comments, commits). Use `contoso` / `example.sharepoint.com` and generic shapes.
- **Node ESM:** relative imports inside `packages/` carry `.js` (`./defaultWidth.js`).
- **Optional props:** `exactOptionalPropertyTypes` is on — never assign `undefined` to an optional member; use conditional spreads (`...(x !== undefined ? { x } : {})`), the existing idiom.
- **Skins:** `@speel/react` ships a single Fluent v8 skin. Every new `TableColumn` member is implemented in v8 (`src/fluent-v8/primitives.tsx`), the test `fakeAdapter` (`test/fakeAdapter.tsx`), and the registry shadcn skin (`registry/src/speel-shadcn/table.tsx`, then `npm run sync:skin`).
- **Builds before downstream use:** the registry and the sample import `@speel/react` from its `dist/`. Run `npm run build -w @speel/react` before running registry tests/typecheck, the sample build, or the layout tests.
- **npm installs** use `--cache "$TMPDIR/npm-cache"` (sandbox).
- **Formatting:** run `npx prettier --write <changed files>` before each commit; CI runs `npm run format:check`.
- **Commits** end with exactly these two trailer lines:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi
  ```
- **Per-kind defaults (exact):** Boolean 70 · Number/Currency 90 · DateTime 100 (`DateOnly`) / 150 (`DateTime`) · Choice 120 / 180 multi · Text 180 / 260 multiline · Lookup 180 / 220 multi · Json 180 · custom (no field) 100.
- **Actions column:** `defaultWidth = n × 32 + (n − 1) × 4`, `n` = built-ins set + `custom.length`; no `width`.
- **Header floor (exact):** `0` when the column has `headerContent`; otherwise `ceil(longestWord + 8 + (sortLabel ? 16 : 0) + (headerFilter ? 28 : 0))`, and just the filter term when the header has no words. Header font: `600 <fonts.medium.fontSize> <fonts.medium.fontFamily>` from the Fluent theme.
- **Break rule (headers and wrapped cells):** `white-space: normal; overflow-wrap: normal; word-break: normal; overflow: hidden; text-overflow: ellipsis`.

## Review Focus

- **A header in a column dragged very narrow (40px) with a filter button** — the label box must shrink to nothing without pushing the button out or overlapping it. Pinned in Task 5's layout test (`d` column at 40px).
- **`.with()` on a navigation (lookup) column** — must inherit the lookup's header, cell renderer and filter exactly as a bare ref does. Pinned in Task 1 (`p.Program.with(...)`).
- **An authored or view width narrower than the header floor** — the author's width must win; the floor only lifts defaults. Pinned in Task 6 (jsdom + layout).
- **A custom `render` returning elements** (a link, a pill) — the hover title must be the element's text, not `[object Object]`, and an empty cell must get no title. Pinned in Tasks 3 (`cellTitle` via `cellText`) and 3 (`setOverflowTitle` with empty text).
- **A column with an empty header** (the actions column) — no measurement of nothing, floor 0 when there's no filter. Pinned in Task 6 (`headerFloor` unit test).

---

### Task 1: Column refs with `.with()` and `ColumnOptions` (#65)

**Files:**

- Modify: `packages/speel-react/src/table/columns.ts`
- Modify: `packages/speel-react/src/table/SpeelTable.tsx:14-18,63-66,172-179`
- Modify: `packages/speel-react/src/index.ts:117-121`
- Test: `packages/speel-react/test/columns.test.tsx`
- Test: `packages/speel-react/test/tableProps.test-d.ts`

**Interfaces:**

- Produces (exported from `@speel/react`):
  ```ts
  export interface ColumnOptions<T> {
    header?: string;
    headerContent?: ReactNode;
    render?: (row: T) => ReactNode;
    width?: number;
    wrap?: boolean;
    cellTitle?: false;
    sortable?: boolean;
    sortValue?: (row: T) => string | number | Date | boolean;
    tableFilter?: TableFilterConfig;
    filterValue?: (row: T) => unknown;
    exportValue?: (row: T) => string | number | Date | boolean | null | undefined;
  }
  export interface ColumnDescriptor<T> extends ColumnOptions<T> { key: string }
  export interface ColumnRef<T> { readonly key: string; with(options: ColumnOptions<T>): ColumnDescriptor<T> }
  export type ColumnRefs<T> = { readonly [K in DataKeys<T>]-?: ColumnRef<T> };
  resolveColumns<T>(et, columns: ColumnSpec<T>[] | ((p: ColumnRefs<T>) => unknown[]) | undefined): ResolvedColumn<T>[]
  SpeelTableProps<T>.columns?: ColumnSpec<T>[] | ((p: ColumnRefs<T>) => (ColumnDescriptor<T> | ColumnRef<T>)[])
  ```
- `headerContent`, `wrap`, `cellTitle` are declared here but only carried through in Task 3.

- [ ] **Step 1: Write the failing runtime tests**

Append to `packages/speel-react/test/columns.test.tsx`, inside the first `describe("resolveColumns", ...)` block (after the "throws for a non-field key without render" test):

```tsx
it("p.Field.with(options) resolves as that field's column, options applied", () => {
  const cols = resolveColumns<Item>(et(), (p) => [
    p.Name.with({ width: 170, header: "Label" }),
    p.Qty,
  ]);
  expect(cols.map((c) => c.key)).toEqual(["Name", "Qty"]);
  expect(cols[0]).toMatchObject({
    header: "Label",
    width: 170,
    sortable: true,
  });
  // Inherited from the field, exactly as a bare ref would get it.
  expect(cols[0]!.filter).toBeDefined();
  expect(cols[0]!.field?.config.kind).toBe("Text");
});

it("a .with() render receives the row and replaces the field's cell", () => {
  const cols = resolveColumns<Item>(et(), (p) => [
    p.Name.with({ render: (r) => `<${r.Name ?? ""}>` }),
  ]);
  const row = Object.assign(new Item(), { Name: "Ada" });
  expect(cols[0]!.render(row)).toBe("<Ada>");
  expect(cols[0]!.header).toBe("Name");
});

it(".with() on a navigation keeps the lookup's header, cell and filter", () => {
  const [bare] = resolveColumns<Item>(et(), (p) => [p.Program]);
  const [withWidth] = resolveColumns<Item>(et(), (p) => [
    p.Program.with({ width: 200 }),
  ]);
  expect(withWidth!.width).toBe(200);
  expect(withWidth!.header).toBe(bare!.header);
  expect(withWidth!.filter?.config).toEqual(bare!.filter?.config);
  const row = Object.assign(new Item(), {
    Program: Object.assign(new Program(), { Id: 1, Title: "Apollo" }),
  });
  expect(withWidth!.render(row)).toEqual(bare!.render(row));
});

it("a bare ref still resolves exactly as before", () => {
  const [viaRef] = resolveColumns<Item>(et(), (p) => [p.Qty]);
  const [viaString] = resolveColumns<Item>(et(), ["Qty"]);
  expect(viaRef!.key).toBe(viaString!.key);
  expect(viaRef!.header).toBe(viaString!.header);
  expect(viaRef!.sortable).toBe(viaString!.sortable);
});
```

- [ ] **Step 2: Write the failing type tests**

Append to `packages/speel-react/test/tableProps.test-d.ts`:

```ts
// ── #65: the columns callback's parameter is a map of column refs ──
class Task implements IEntity {
  Id?: number;
  Title?: string;
  Status?: string;
  describe(): string {
    return this.Title ?? "";
  }
}
type Cols = NonNullable<SpeelTableProps<Task>["columns"]>;

// A bare ref and a ref with options both type-check.
expectType<Cols>((p) => [p.Title, p.Status.with({ width: 120 })]);
// render's row is the entity, with no annotation.
expectType<Cols>((p) => [p.Title.with({ render: (r) => r.Status ?? "" })]);
// @ts-expect-error — a misspelt field is a compile error
expectType<Cols>((p) => [p.Titel]);
// @ts-expect-error — render's row is the entity, so a misspelt field fails there too
expectType<Cols>((p) => [p.Title.with({ render: (r) => r.Titel })]);
// @ts-expect-error — methods are not columns
expectType<Cols>((p) => [p.describe]);
// @ts-expect-error — the parameter is a map of column refs, not the entity
expectType<Cols>((p: Task) => [p.Title]);
```

(`IEntity` and `expectType` are already imported/declared at the top of that file.) Keep each `expectType` call on one line so every `@ts-expect-error` stays directly above its error — check after running prettier.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w @speel/react -- --run test/columns.test.tsx` then `npx tsc -p packages/speel-react/tsconfig.test.json`
Expected: vitest FAILs with `p.Name.with is not a function`; tsc reports errors in `tableProps.test-d.ts` (`Property 'with' does not exist on type 'string'` and unused `@ts-expect-error` directives).

- [ ] **Step 4: Implement `ColumnOptions`, `ColumnRef`, `ColumnRefs` and `.with()`**

In `packages/speel-react/src/table/columns.ts`, replace the `ColumnDescriptor` interface (lines 12-23) with:

```ts
/** Every column option except `key` — what `p.Field.with(...)` takes. */
export interface ColumnOptions<T> {
  header?: string;
  /** Rendered in the header cell in place of `header`'s text. `header` still names the
   *  column everywhere else — export, the column chooser, filter chips, hover titles. */
  headerContent?: ReactNode;
  render?: (row: T) => ReactNode;
  width?: number;
  /** Break long values onto more lines, at spaces, instead of cutting them off. */
  wrap?: boolean;
  /** `false` opts the column out of the hover title a cut-off cell shows. */
  cellTitle?: false;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | Date | boolean;
  tableFilter?: TableFilterConfig;
  filterValue?: (row: T) => unknown;
  /** The text this column exports to CSV. Wins over everything the exporter can infer. */
  exportValue?: (row: T) => string | number | Date | boolean | null | undefined;
}
export interface ColumnDescriptor<T> extends ColumnOptions<T> {
  key: string;
}
export type ColumnSpec<T> = string | ColumnDescriptor<T>;

/** A field column picked through the `columns` callback: `p.Title`, or `p.Title.with({...})`. */
export interface ColumnRef<T> {
  readonly key: string;
  /** This field's column with options — a width, a header, a render — still keyed to the field. */
  with(options: ColumnOptions<T>): ColumnDescriptor<T>;
}

/** The keys of `T` that hold data — methods are not columns. */
type DataKeys<T> = {
  [K in keyof T & string]-?: T[K] extends (...args: never[]) => unknown
    ? never
    : K;
}[keyof T & string];

/** What the `columns` callback receives: one column ref per data property of the entity. */
export type ColumnRefs<T> = { readonly [K in DataKeys<T>]-?: ColumnRef<T> };
```

(Delete the old `export type ColumnSpec<T> = string | ColumnDescriptor<T>;` line that followed the old interface — it is now declared above.)

Replace the internal ref block (lines 52-63: `const COL_REF ...` through `isColumnRef`) with:

```ts
const COL_REF = Symbol("speelColumnRef");
/** The runtime shape of a `ColumnRef`, branded so `resolveColumns` can tell it from a descriptor. */
interface BrandedRef<T> extends ColumnRef<T> {
  [COL_REF]: true;
}
function isColumnRef(x: unknown): x is BrandedRef<unknown> {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as Record<symbol, unknown>)[COL_REF] === true
  );
}
```

Replace `columnProxy` and the `resolveColumns` signature (lines 279-298) with:

```ts
function columnProxy<T>(): ColumnRefs<T> {
  return new Proxy(
    {},
    {
      get(_t, prop): unknown {
        if (typeof prop === "symbol") return undefined;
        const ref: BrandedRef<T> = {
          [COL_REF]: true,
          key: prop,
          // A plain descriptor, unbranded, so it resolves down the descriptor path with its
          // options intact. `key` last: the ref's field wins over anything smuggled in.
          with: (options) => ({ ...options, key: prop }),
        };
        return ref;
      },
    },
  ) as ColumnRefs<T>;
}

/** Resolve `columns` (default / array / proxy-accessor) into render-ready columns. */
export function resolveColumns<T>(
  et: EntityType,
  columns: ColumnSpec<T>[] | ((p: ColumnRefs<T>) => unknown[]) | undefined,
): ResolvedColumn<T>[] {
  if (!columns) return defaultColumns<T>(et);
  const list =
    typeof columns === "function" ? columns(columnProxy<T>()) : columns;
```

(the rest of `resolveColumns` is unchanged).

- [ ] **Step 5: Retype the prop and export the new types**

In `packages/speel-react/src/table/SpeelTable.tsx`:

```ts
import {
  resolveColumns,
  type ColumnSpec,
  type ColumnDescriptor,
  type ColumnRef,
  type ColumnRefs,
} from "./columns.js";
```

```ts
  columns?:
    | ColumnSpec<T>[]
    | ((p: ColumnRefs<T>) => (ColumnDescriptor<T> | ColumnRef<T>)[]);
```

and in the `resolved` memo change the cast to:

```ts
        columns as ColumnSpec<T>[] | ((p: ColumnRefs<T>) => unknown[]) | undefined,
```

In `packages/speel-react/src/index.ts`, extend the `./table/columns.js` type export:

```ts
export type {
  ColumnSpec,
  ColumnDescriptor,
  ColumnOptions,
  ColumnRef,
  ColumnRefs,
  ResolvedColumn,
} from "./table/columns.js";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -w @speel/react` (vitest + `tsc -p tsconfig.test.json`)
Expected: all PASS, tsc clean (every `@ts-expect-error` used).

- [ ] **Step 7: Prove the sample still compiles against the new prop type**

Run: `npm run build -w @speel/react && npm --prefix samples/spfx-sample run build:check`
Expected: heft build succeeds (the sample's `columns={(p) => [...]}` / `(a) => [...]` call sites need no change).

- [ ] **Step 8: Commit**

```bash
npx prettier --write packages/speel-react/src/table/columns.ts packages/speel-react/src/table/SpeelTable.tsx packages/speel-react/src/index.ts packages/speel-react/test/columns.test.tsx packages/speel-react/test/tableProps.test-d.ts
git add packages/speel-react/src/table/columns.ts packages/speel-react/src/table/SpeelTable.tsx packages/speel-react/src/index.ts packages/speel-react/test/columns.test.tsx packages/speel-react/test/tableProps.test-d.ts
git commit -m "feat(react): typed column refs — p.Field.with({...}) (#65)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 2: Per-kind default widths and the actions column hint (#64 core, #67)

**Files:**

- Create: `packages/speel-react/src/table/defaultWidth.ts`
- Modify: `packages/speel-react/src/table/columns.ts` (`ResolvedColumn`, `autoColumn`, `descriptorColumn`, `defaultColumns`)
- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts:285-292` (`TableColumn`)
- Modify: `packages/speel-react/src/table/SpeelTable.tsx:253-324`
- Modify: `packages/speel-react/test/fakeAdapter.tsx` (Table `<th>`)
- Test: `packages/speel-react/test/defaultWidth.test.ts` (create)
- Test: `packages/speel-react/test/SpeelTable.widths.test.tsx` (create)

**Interfaces:**

- Consumes: `ColumnDescriptor<T>` from Task 1.
- Produces:

  ```ts
  // table/defaultWidth.ts
  export const CUSTOM_COLUMN_WIDTH = 100;
  export function defaultWidthFor(config: FieldConfig | undefined): number;
  // ResolvedColumn<T>
  defaultWidth?: number; // always set by resolveColumns
  // TableColumn
  defaultWidth?: number;
  ```

- [ ] **Step 1: Write the failing unit test**

Create `packages/speel-react/test/defaultWidth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { FieldConfig } from "@speel/core";
import {
  CUSTOM_COLUMN_WIDTH,
  defaultWidthFor,
} from "../src/table/defaultWidth.js";

/** Only the members the width reads; the rest of each config is irrelevant here. */
const cfg = (c: object): FieldConfig => c as FieldConfig;

describe("defaultWidthFor", () => {
  it.each([
    ["Boolean", cfg({ kind: "Boolean" }), 70],
    ["Number", cfg({ kind: "Number" }), 90],
    ["Currency", cfg({ kind: "Currency", decimalPlaces: 2 }), 90],
    ["DateOnly", cfg({ kind: "DateTime", displayFormat: "DateOnly" }), 100],
    ["DateTime", cfg({ kind: "DateTime", displayFormat: "DateTime" }), 150],
    ["Choice", cfg({ kind: "Choice", multi: false }), 120],
    ["multi Choice", cfg({ kind: "Choice", multi: true }), 180],
    ["Text", cfg({ kind: "Text", multiline: false }), 180],
    ["Note", cfg({ kind: "Text", multiline: true }), 260],
    ["Lookup", cfg({ kind: "Lookup", multi: false }), 180],
    ["multi Lookup", cfg({ kind: "Lookup", multi: true }), 220],
    ["Json", cfg({ kind: "Json", multi: false }), 180],
  ])("%s → %i", (_name, config, width) => {
    expect(defaultWidthFor(config)).toBe(width);
  });

  it("gives a column with no field the custom default", () => {
    expect(defaultWidthFor(undefined)).toBe(CUSTOM_COLUMN_WIDTH);
    expect(CUSTOM_COLUMN_WIDTH).toBe(100);
  });
});
```

- [ ] **Step 2: Write the failing table test**

Create `packages/speel-react/test/SpeelTable.widths.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Status?: string;
  Done?: boolean;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Closed"]);
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
  Object.assign(new Task(), { Id: 1, Title: "A", Status: "Open", Done: true }),
];
const th = (container: HTMLElement, i: number): HTMLElement =>
  container.querySelectorAll<HTMLElement>("th")[i]!;
const noop = (): void => undefined;

describe("SpeelTable width hints", () => {
  it("hands each column its field kind's default as a hint, not a width", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title", "Status", "Done"]}
      />,
    );
    expect(th(container, 0).dataset["defaultWidth"]).toBe("180");
    expect(th(container, 1).dataset["defaultWidth"]).toBe("120");
    expect(th(container, 2).dataset["defaultWidth"]).toBe("70");
    expect(th(container, 0).dataset["width"]).toBeUndefined();
  });

  it("passes an authored width alongside the hint", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={(p) => [p.Title.with({ width: 300 })]}
      />,
    );
    expect(th(container, 0).dataset["width"]).toBe("300");
    expect(th(container, 0).dataset["defaultWidth"]).toBe("180");
  });

  it("gives a custom column the custom default", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "x", header: "X", render: () => "x" }]}
      />,
    );
    expect(th(container, 0).dataset["defaultWidth"]).toBe("100");
  });

  it.each([
    ["one built-in", { onView: noop }, 32],
    ["three built-ins", { onView: noop, onEdit: noop, onDelete: noop }, 104],
    [
      "three built-ins + one custom",
      {
        onView: noop,
        onEdit: noop,
        onDelete: noop,
        custom: [{ key: "u", iconName: "Upload", title: "Up", onClick: noop }],
      },
      140,
    ],
  ])("sizes the actions column for %s", (_name, rowActions, expected) => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title"]}
        rowActions={rowActions}
      />,
    );
    const actions = th(container, 1);
    expect(actions.dataset["defaultWidth"]).toBe(String(expected));
    expect(actions.dataset["width"]).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w @speel/react -- --run test/defaultWidth.test.ts test/SpeelTable.widths.test.tsx`
Expected: FAIL — `Cannot find module '../src/table/defaultWidth.js'`, and `data-default-width` undefined / actions `data-width` = `"170"`.

- [ ] **Step 4: Implement `defaultWidthFor`**

Create `packages/speel-react/src/table/defaultWidth.ts`:

```ts
import type { FieldConfig } from "@speel/core";

/** The default for a column with no model field behind it. */
export const CUSTOM_COLUMN_WIDTH = 100;

/**
 * The width a column starts at when nobody has given it one, by what its field holds: a
 * Yes/No needs little, a person or a note needs room. A hint for skins that need a number —
 * the v8 skin holds a column at it; a skin that sizes columns to content ignores it.
 */
export function defaultWidthFor(config: FieldConfig | undefined): number {
  if (!config) return CUSTOM_COLUMN_WIDTH;
  switch (config.kind) {
    case "Boolean":
      return 70;
    case "Number":
    case "Currency":
      return 90;
    case "DateTime":
      return config.displayFormat === "DateTime" ? 150 : 100;
    case "Choice":
      return config.multi ? 180 : 120;
    case "Text":
      return config.multiline ? 260 : 180;
    case "Lookup":
      return config.multi ? 220 : 180;
    case "Json":
      return 180;
  }
}
```

- [ ] **Step 5: Carry it through `ResolvedColumn`**

In `packages/speel-react/src/table/columns.ts`:

- `import { defaultWidthFor } from "./defaultWidth.js";`
- In `ResolvedColumn<T>` after `width?: number;` add:
  ```ts
    /** The width to hold the column at when nobody has given it one — `defaultWidthFor`. */
    defaultWidth?: number;
  ```
- In `autoColumn`'s returned object add `defaultWidth: defaultWidthFor(field.config),` after `render`.
- In `descriptorColumn`'s `base` add `defaultWidth: defaultWidthFor(field?.config),` after `render`.
- In both `cols.push({...})` calls of `defaultColumns` add `defaultWidth: defaultWidthFor(p.config),` and `defaultWidth: defaultWidthFor(nav.config),` respectively, after `render`.

In `packages/speel-react/src/adapter/SpeelUIAdapter.ts`, in `TableColumn` after `width?: number;`:

```ts
  /** The width to hold the column at when `width` is absent — a hint for skins that need a
   *  number. A skin that sizes columns to their content ignores it. */
  defaultWidth?: number;
```

- [ ] **Step 6: Pass the hint and size the actions column**

In `packages/speel-react/src/table/SpeelTable.tsx`, in the `tableColumns` map add after the `width` spread:

```tsx
    ...(c.defaultWidth !== undefined ? { defaultWidth: c.defaultWidth } : {}),
```

Replace the actions block's `if` header and `width` line (lines 283-289) with:

```tsx
  const ra = rowActions ?? {};
  const customActions = ra.custom ?? [];
  const actionCount =
    [ra.onView, ra.onEdit, ra.onDelete].filter(Boolean).length +
    customActions.length;
  if (actionCount > 0) {
    tableColumns.push({
      key: "__actions",
      header: "",
      // As wide as the buttons it renders: 32px icon buttons, 4px apart. A hint, not a width,
      // so a skin that sizes columns to content fits it exactly.
      defaultWidth: actionCount * 32 + (actionCount - 1) * 4,
```

(the `render:` member that follows is unchanged).

- [ ] **Step 7: Expose the hint in the fake adapter**

In `packages/speel-react/test/fakeAdapter.tsx`, on the Table's `<th>` add next to `data-width={c.width}`:

```tsx
                data-default-width={c.defaultWidth}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -w @speel/react`
Expected: all PASS (including the existing `SpeelTable.test.tsx` row-action tests).

- [ ] **Step 9: Commit**

```bash
npx prettier --write packages/speel-react/src/table/defaultWidth.ts packages/speel-react/src/table/columns.ts packages/speel-react/src/adapter/SpeelUIAdapter.ts packages/speel-react/src/table/SpeelTable.tsx packages/speel-react/test/fakeAdapter.tsx packages/speel-react/test/defaultWidth.test.ts packages/speel-react/test/SpeelTable.widths.test.tsx
git add packages/speel-react/src/table/defaultWidth.ts packages/speel-react/src/table/columns.ts packages/speel-react/src/adapter/SpeelUIAdapter.ts packages/speel-react/src/table/SpeelTable.tsx packages/speel-react/test/fakeAdapter.tsx packages/speel-react/test/defaultWidth.test.ts packages/speel-react/test/SpeelTable.widths.test.tsx
git commit -m "feat(react): per-kind default column widths; actions column sized to its buttons (#64 #67)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 3: `wrap`, `cellTitle`, `headerContent` plumbing and `setOverflowTitle` (#63 #66 #57 core)

**Files:**

- Create: `packages/speel-react/src/table/overflowTitle.ts`
- Modify: `packages/speel-react/src/table/columns.ts` (`ResolvedColumn`, `descriptorColumn`)
- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`TableColumn`)
- Modify: `packages/speel-react/src/table/SpeelTable.tsx` (`tableColumns` map)
- Modify: `packages/speel-react/src/index.ts` (skin-support exports, near `useResizable`)
- Modify: `packages/speel-react/test/fakeAdapter.tsx` (`FakeTableHeaderCell`, `<th>`, `<td>`)
- Test: `packages/speel-react/test/overflowTitle.test.ts` (create)
- Test: `packages/speel-react/test/SpeelTable.columnOptions.test.tsx` (create)

**Interfaces:**

- Consumes: `ColumnOptions.wrap/cellTitle/headerContent` (Task 1), `cellText(col, row)` from `src/table/cellText.ts`.
- Produces:

  ```ts
  // ResolvedColumn<T>
  wrap?: boolean; cellTitle?: false; headerContent?: ReactNode;
  // TableColumn
  wrap?: boolean;
  cellTitle?: (row: unknown) => string;
  headerContent?: ReactNode;
  // exported from "@speel/react"
  export function setOverflowTitle(el: HTMLElement, getText: () => string): void;
  ```

- [ ] **Step 1: Write the failing helper test**

Create `packages/speel-react/test/overflowTitle.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { setOverflowTitle } from "../src/table/overflowTitle.js";

/** jsdom has no layout: give the element the box sizes a browser would report. */
function box(scrollWidth: number, clientWidth: number): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth });
  Object.defineProperty(el, "clientWidth", { value: clientWidth });
  return el;
}

describe("setOverflowTitle", () => {
  it("titles an element whose content is cut off", () => {
    const el = box(200, 80);
    setOverflowTitle(el, () => "Bartholomew Longname");
    expect(el.title).toBe("Bartholomew Longname");
  });

  it("clears the title once the content fits, and never computes the text", () => {
    const el = box(80, 80);
    el.title = "stale";
    const getText = vi.fn(() => "x");
    setOverflowTitle(el, getText);
    expect(el.hasAttribute("title")).toBe(false);
    expect(getText).not.toHaveBeenCalled();
  });

  it("sets no title when a cut-off cell has no text", () => {
    const el = box(200, 80);
    setOverflowTitle(el, () => "");
    expect(el.hasAttribute("title")).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing table test**

Create `packages/speel-react/test/SpeelTable.columnOptions.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Org {
  Id?: number;
  Title?: string;
  Notes?: string;
}
class OCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Org, (b) => {
      b.toList("Orgs");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
      b.property((e) => e.Notes)
        .isText()
        .hasDisplayName("Notes");
    });
  }
}
function wrap(node: JSX.Element) {
  const ctx = new OCtx({ provider: makeFakeProvider({ Orgs: [] }) } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      {node}
    </SpeelProvider>,
  );
}
const rows = [
  Object.assign(new Org(), { Id: 1, Title: "Contoso Ltd", Notes: "n" }),
];
const cell = (container: HTMLElement, i: number): HTMLElement =>
  container.querySelectorAll<HTMLElement>("tbody td")[i]!;
const head = (container: HTMLElement, i: number): HTMLElement =>
  container.querySelectorAll<HTMLElement>("th")[i]!;

describe("SpeelTable column options", () => {
  it("hands every data column its cell text for a hover title", () => {
    const { container } = wrap(
      <SpeelTable of={Org} items={rows} columns={["Title"]} />,
    );
    expect(cell(container, 0).dataset["cellTitle"]).toBe("Contoso Ltd");
  });

  it("reads a custom render's text, not the element", () => {
    const { container } = wrap(
      <SpeelTable
        of={Org}
        items={rows}
        columns={(p) => [
          p.Title.with({ render: (r) => <a href="#x">{r.Title}</a> }),
        ]}
      />,
    );
    expect(cell(container, 0).dataset["cellTitle"]).toBe("Contoso Ltd");
  });

  it("leaves out the hover title when the column opts out", () => {
    const { container } = wrap(
      <SpeelTable
        of={Org}
        items={rows}
        columns={(p) => [p.Notes.with({ cellTitle: false })]}
      />,
    );
    expect(cell(container, 0).dataset["cellTitle"]).toBeUndefined();
  });

  it("gives the actions column no hover title", () => {
    const { container } = wrap(
      <SpeelTable
        of={Org}
        items={rows}
        columns={["Title"]}
        rowActions={{ onView: () => undefined }}
      />,
    );
    expect(cell(container, 1).dataset["cellTitle"]).toBeUndefined();
  });

  it("carries wrap to the skin", () => {
    const { container } = wrap(
      <SpeelTable
        of={Org}
        items={rows}
        columns={(p) => [p.Title.with({ wrap: true }), p.Notes]}
      />,
    );
    expect(head(container, 0).dataset["wrap"]).toBe("");
    expect(head(container, 1).dataset["wrap"]).toBeUndefined();
  });

  it("renders headerContent in the header while header still names the column", () => {
    const { container } = wrap(
      <SpeelTable
        of={Org}
        items={rows}
        columns={[
          {
            key: "select",
            header: "Select",
            headerContent: <input type="checkbox" aria-label="Select all" />,
            render: () => <input type="checkbox" aria-label="Select row" />,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Select all" }),
    ).toBeInTheDocument();
    expect(head(container, 0).textContent).not.toContain("Select");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w @speel/react -- --run test/overflowTitle.test.ts test/SpeelTable.columnOptions.test.tsx`
Expected: FAIL — missing `overflowTitle.js`; `data-cell-title` / `data-wrap` undefined; no "Select all" checkbox.

- [ ] **Step 4: Implement `setOverflowTitle` and export it**

Create `packages/speel-react/src/table/overflowTitle.ts`:

```ts
/**
 * A hover title for a cell the skin has cut off — and only for one that is. Call it from the
 * cell's `mouseenter`: it sets the title on the element itself rather than through state, so
 * hovering costs no render, and the text is only computed when the content overflows.
 */
export function setOverflowTitle(el: HTMLElement, getText: () => string): void {
  const text = el.scrollWidth > el.clientWidth ? getText() : "";
  if (text !== "") el.title = text;
  else el.removeAttribute("title");
}
```

In `packages/speel-react/src/index.ts`, directly after the `useResizable` export block (around line 231-236), add:

```ts
export { setOverflowTitle } from "./table/overflowTitle.js";
```

- [ ] **Step 5: Carry the options through `ResolvedColumn`**

In `packages/speel-react/src/table/columns.ts`, in `ResolvedColumn<T>` after `defaultWidth?: number;`:

```ts
  /** Break long values onto more lines instead of cutting them off. */
  wrap?: boolean;
  /** `false` when the column opted out of the cut-off hover title. */
  cellTitle?: false;
  /** Shown in the header cell in place of `header`'s text. */
  headerContent?: ReactNode;
```

In `descriptorColumn`'s `base`, after the `exportValue` spread:

```ts
    ...(d.wrap ? { wrap: true } : {}),
    ...(d.cellTitle === false ? { cellTitle: false as const } : {}),
    ...(d.headerContent !== undefined ? { headerContent: d.headerContent } : {}),
```

- [ ] **Step 6: Add the adapter members and pass them from `SpeelTable`**

In `packages/speel-react/src/adapter/SpeelUIAdapter.ts`, in `TableColumn` after `headerFilter?`:

```ts
  /** Break long values onto more lines, at spaces, instead of cutting them off. */
  wrap?: boolean;
  /** A cell's full text, for a hover title when the skin has cut the cell off. */
  cellTitle?: (row: unknown) => string;
  /** Rendered in the header cell in place of `header`'s text — never as a sort button.
   *  `header` still names the column everywhere else. */
  headerContent?: ReactNode;
```

In `packages/speel-react/src/table/SpeelTable.tsx` add `import { cellText } from "./cellText.js";` and, in the `tableColumns` map after the `defaultWidth` spread:

```tsx
    ...(c.wrap ? { wrap: true } : {}),
    // The text export and search read — computed only when a skin asks, on hover.
    ...(c.cellTitle !== false
      ? { cellTitle: (row: unknown) => cellText(c, row as T) }
      : {}),
    ...(c.headerContent !== undefined ? { headerContent: c.headerContent } : {}),
```

(The actions column is pushed separately and gets none of these.)

- [ ] **Step 7: Teach the fake adapter the new members**

In `packages/speel-react/test/fakeAdapter.tsx`:

In `FakeTableHeaderCell`, replace the sort-button/label conditional with:

```tsx
{
  column.headerContent !== undefined ? (
    <span>{column.headerContent}</span>
  ) : column.sortable && onSortChange ? (
    <button type="button" onClick={() => onSortChange(column.key)}>
      {column.header}
      <span aria-hidden="true">
        {sorted ? (sort!.direction === "asc" ? " ▲" : " ▼") : ""}
      </span>
    </button>
  ) : (
    <span>{column.header}</span>
  );
}
```

On the Table's `<th>` add `data-wrap={c.wrap ? "" : undefined}`; replace the body cell with:

```tsx
<td key={c.key} data-cell-title={c.cellTitle?.(row)}>
  {c.render(row)}
</td>
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -w @speel/react`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
npx prettier --write packages/speel-react/src/table/overflowTitle.ts packages/speel-react/src/table/columns.ts packages/speel-react/src/adapter/SpeelUIAdapter.ts packages/speel-react/src/table/SpeelTable.tsx packages/speel-react/src/index.ts packages/speel-react/test/fakeAdapter.tsx packages/speel-react/test/overflowTitle.test.ts packages/speel-react/test/SpeelTable.columnOptions.test.tsx
git add packages/speel-react/src/table/overflowTitle.ts packages/speel-react/src/table/columns.ts packages/speel-react/src/adapter/SpeelUIAdapter.ts packages/speel-react/src/table/SpeelTable.tsx packages/speel-react/src/index.ts packages/speel-react/test/fakeAdapter.tsx packages/speel-react/test/overflowTitle.test.ts packages/speel-react/test/SpeelTable.columnOptions.test.tsx
git commit -m "feat(react): wrap, cellTitle and headerContent column options; setOverflowTitle (#63 #66 #57)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 4: Offline layout test project in the sample

**Files:**

- Modify: `samples/spfx-sample/package.json` (scripts, `esbuild` devDependency) and `samples/spfx-sample/package-lock.json`
- Modify: `samples/spfx-sample/playwright.config.ts` (`projects`)
- Create: `samples/spfx-sample/tests/layout/fixture.tsx`
- Create: `samples/spfx-sample/tests/layout/lines.ts`
- Create: `samples/spfx-sample/tests/layout/tableLayout.spec.ts`
- Modify: `package.json:17` (`verify`)
- Modify: `.github/workflows/ci.yml` (Chromium install step)

**Interfaces:**

- Consumes: `V8Table` from `@speel/react/fluent-v8`, `TableColumn` type from `@speel/react` (built `dist/`).
- Produces for Tasks 5–7: the fixture's `scenarios` array (each `{ name, containerWidth, columns, items }`, rendered as `section[data-scenario=<name>]`), the `col(key, header, extra)` and `filter` helpers in `fixture.tsx`, and in the spec file the helpers `open(page)`, `scenario(page, name)`, `headerCells(locator)`, `rowCells(locator, row)`, and `lineTexts` (from `lines.ts`). Later tasks add scenarios to `fixture.tsx` and tests to `tableLayout.spec.ts`.

- [ ] **Step 1: Add esbuild and the scripts**

```bash
npm --prefix samples/spfx-sample install --save-dev esbuild --cache "$TMPDIR/npm-cache" --no-audit --no-fund
```

In `samples/spfx-sample/package.json` `scripts`, after `test:unit`:

```json
    "test:layout": "playwright test --project=layout",
    "playwright:install": "playwright install --with-deps chromium",
```

- [ ] **Step 2: Add the `layout` project**

In `samples/spfx-sample/playwright.config.ts`, add to `projects` after the `unit` project:

```ts
    {
      // Real-layout checks of the v8 table skin, against a fixture page bundled from the
      // sample's own @speel/react, React and Fluent. Offline — no tenant, no serve — so it
      // runs in `verify`. `test:layout` selects it.
      name: "layout",
      testMatch: /layout\/.*\.spec\.ts$/,
      timeout: 30_000,
      use: { ...devices["Desktop Chrome"] },
    },
```

- [ ] **Step 3: Write the fixture page**

Create `samples/spfx-sample/tests/layout/fixture.tsx`:

```tsx
// Bundled by tableLayout.spec.ts with esbuild and loaded into a blank page. Every scenario
// renders at once, each in its own section[data-scenario]; specs measure them in place.
import * as React from "react";
import * as ReactDOM from "react-dom";
import { ThemeProvider, createTheme, loadTheme } from "@fluentui/react";
import { V8Table } from "@speel/react/fluent-v8";
import type { TableColumn } from "@speel/react";

// Liberation Sans ships with Playwright's Linux dependencies: pinning it makes the skin's
// canvas measurements and the browser's line breaking agree on every machine.
const theme = createTheme({
  defaultFontStyle: { fontFamily: "'Liberation Sans', Arial, sans-serif" },
});
loadTheme(theme);

type Row = Record<string, string>;

/** A text column that renders `row[key]`. */
function col(
  key: string,
  header: string,
  extra: Partial<TableColumn> = {},
): TableColumn {
  return { key, header, render: (row) => (row as Row)[key] ?? "", ...extra };
}
/** A filter button with an empty popover: the header layout is what's under test. */
const filter = { active: false, content: null };

interface Scenario {
  name: string;
  containerWidth: number;
  columns: TableColumn[];
  items: Row[];
}

const scenarios: Scenario[] = [
  {
    name: "authored-widths",
    containerWidth: 1200,
    columns: [
      col("a", "Supervisor", {
        width: 200,
        sortable: true,
        headerFilter: filter,
      }),
      col("b", "Plain", { width: 120 }),
    ],
    items: [{ a: "Ada", b: "x" }],
  },
];

function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      {scenarios.map((s) => (
        <section
          key={s.name}
          data-scenario={s.name}
          style={{ width: s.containerWidth, marginBottom: 24 }}
        >
          <V8Table
            columns={s.columns}
            items={s.items}
            onSortChange={() => undefined}
          />
        </section>
      ))}
    </ThemeProvider>
  );
}

ReactDOM.render(<App />, document.getElementById("root"), () => {
  document.body.dataset["ready"] = "1";
});
```

- [ ] **Step 4: Write the line-box helper**

Create `samples/spfx-sample/tests/layout/lines.ts`:

```ts
/**
 * The text of each line an element renders, read from per-character client rects: a
 * character whose top is clearly below the current line's starts a new one. Characters cut
 * off by `text-overflow` still report rects on their own line, so a word that ends in "…"
 * reads whole here — exactly what "never split across lines" needs.
 *
 * Self-contained on purpose: Playwright serialises it into the page.
 */
export function lineTexts(el: Element): string[] {
  const lines: string[] = [];
  let lineTop = Number.NEGATIVE_INFINITY;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    for (let i = 0; i < text.length; i++) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.top > lineTop + 3) {
        lines.push("");
        lineTop = rect.top;
      }
      lines[lines.length - 1] += text[i];
    }
  }
  return lines.map((l) => l.trim()).filter((l) => l !== "");
}

/** Whether every whitespace-separated word of `text` sits whole on one of `lines`. */
export function wordsWhole(lines: string[], text: string): boolean {
  return text
    .split(/\s+/)
    .every((word) => lines.some((line) => line.split(/\s+/).includes(word)));
}
```

- [ ] **Step 5: Write the spec with a baseline test**

Create `samples/spfx-sample/tests/layout/tableLayout.spec.ts`:

```ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { build, type Plugin } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { lineTexts, wordsWhole } from "./lines";

const sampleDir = path.resolve(__dirname, "../..");
const fromSample = createRequire(path.join(sampleDir, "package.json"));

/**
 * One React and one Fluent in the bundle: the sample's, the versions SPFx ships.
 * `@speel/react` is a file: link, so without this its own imports would resolve from the
 * repo root's copies and the page would run two Reacts.
 */
const singleCopies: Plugin = {
  name: "single-copies",
  setup(b) {
    b.onResolve(
      { filter: /^(react|react-dom|@fluentui\/[^/]+)(\/.*)?$/ },
      (args) => ({ path: fromSample.resolve(args.path) }),
    );
  },
};

let bundle = "";
test.beforeAll(async () => {
  const out = await build({
    entryPoints: [path.join(__dirname, "fixture.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [singleCopies],
    logLevel: "silent",
  });
  bundle = out.outputFiles[0]!.text;
});

async function open(page: Page): Promise<void> {
  await page.route("**/*", (route) => route.abort()); // offline: nothing leaves the page
  await page.setContent(
    '<!doctype html><html><body style="margin:0"><div id="root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => document.body.dataset["ready"] === "1");
}
const scenario = (page: Page, name: string): Locator =>
  page.locator(`section[data-scenario="${name}"]`);
const headerCells = (s: Locator): Locator =>
  s.locator('[data-automationid="ColumnsHeaderColumn"]');
const rowCells = (s: Locator, row: number): Locator =>
  s
    .locator('[data-automationid="DetailsRow"]')
    .nth(row)
    .locator('[data-automationid="DetailsRowCell"]');
const widthOf = (l: Locator): Promise<number> =>
  l.evaluate((el) => el.getBoundingClientRect().width);

test("columns hold their authored widths", async ({ page }) => {
  await open(page);
  const cells = headerCells(scenario(page, "authored-widths"));
  // DetailsList adds 20px of cell padding to every laid-out width; the last column also
  // stretches into the container's slack.
  expect(await widthOf(cells.nth(0))).toBeCloseTo(220, 0);
  expect(await widthOf(cells.nth(1))).toBeGreaterThanOrEqual(140);
});
```

- [ ] **Step 6: Wire it into verify and CI**

In the root `package.json`, append to the end of the `verify` script: ` && npm --prefix samples/spfx-sample run test:layout`.

In `.github/workflows/ci.yml`, insert after `- run: npm ci --prefix samples/spfx-sample`:

```yaml
# Chromium (and the Liberation fonts the layout fixture pins) for test:layout.
- run: npm --prefix samples/spfx-sample run playwright:install
```

- [ ] **Step 7: Run it**

Run: `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`
Expected: `1 passed`. If Chromium is missing locally run `npm --prefix samples/spfx-sample exec -- playwright install chromium` first. If the bundle fails with a duplicate-React "Invalid hook call", the `singleCopies` filter is missing a package — print `out.metafile` inputs to find it.

- [ ] **Step 8: Commit**

```bash
npx prettier --write samples/spfx-sample/package.json samples/spfx-sample/playwright.config.ts samples/spfx-sample/tests/layout package.json .github/workflows/ci.yml
git add samples/spfx-sample/package.json samples/spfx-sample/package-lock.json samples/spfx-sample/playwright.config.ts samples/spfx-sample/tests/layout package.json .github/workflows/ci.yml
git commit -m "test(sample): offline Playwright layout project for the v8 table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 5: v8 header — flex row, break only at spaces, `headerContent` (#62, #57 skin)

**Files:**

- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx:587-708` (`HEADER_LABEL_STYLE`, `V8HeaderCell`)
- Modify: `packages/speel-react/test/v8TableHeader.test.tsx`
- Modify: `samples/spfx-sample/tests/layout/fixture.tsx` (scenario `headers`)
- Modify: `samples/spfx-sample/tests/layout/tableLayout.spec.ts` (header tests)

**Interfaces:**

- Consumes: `TableColumn.headerContent` (Task 3); fixture/spec helpers (Task 4).
- Produces: header markup `<span style=row><span data-header-label style=box>…label…</span>[filter]</span>`; Task 6's layout test locates `[data-header-label]`.

- [ ] **Step 1: Add the failing layout scenario and tests**

In `samples/spfx-sample/tests/layout/fixture.tsx`, append to `scenarios`:

```tsx
  {
    name: "headers",
    containerWidth: 1200,
    columns: [
      col("a", "Supervisor", { width: 92, sortable: true, headerFilter: filter }),
      col("b", "Supervisor", { width: 200, sortable: true, headerFilter: filter }),
      col("c", "Separation Date", { width: 92, sortable: true, headerFilter: filter }),
      col("d", "Supervisor", { width: 40, sortable: true, headerFilter: filter }),
      col("e", "Select", {
        width: 80,
        sortable: true,
        headerContent: <input type="checkbox" aria-label="Select all" />,
      }),
      col("f", "Filler", { width: 50 }),
    ],
    items: [{ a: "x", b: "x", c: "x", d: "x", e: "x", f: "x" }],
  },
```

In `samples/spfx-sample/tests/layout/tableLayout.spec.ts`, add:

```ts
test.describe("header labels", () => {
  const labelled = [
    "Supervisor",
    "Supervisor",
    "Separation Date",
    "Supervisor",
  ];

  test("break only at spaces: every word stays on one line", async ({
    page,
  }) => {
    await open(page);
    const boxes = scenario(page, "headers").locator("[data-header-label]");
    for (const [i, header] of labelled.entries()) {
      const lines = await boxes.nth(i).evaluate(lineTexts);
      expect(
        wordsWhole(lines, header),
        `${header} [${i}]: ${lines.join(" / ")}`,
      ).toBe(true);
    }
  });

  test("end a word wider than the label box in an ellipsis", async ({
    page,
  }) => {
    await open(page);
    const boxes = scenario(page, "headers").locator("[data-header-label]");
    const overflows = (l: Locator): Promise<boolean> =>
      l.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(await overflows(boxes.nth(0))).toBe(true); // 92px: "Supervisor" beside the button
    expect(await overflows(boxes.nth(1))).toBe(false); // 200px: fits
    const style = await boxes
      .nth(0)
      .evaluate((el) => getComputedStyle(el).textOverflow);
    expect(style).toBe("ellipsis");
  });

  test("never run under or into the filter button", async ({ page }) => {
    await open(page);
    const cells = headerCells(scenario(page, "headers"));
    for (const i of [0, 1, 2, 3]) {
      const box = await cells
        .nth(i)
        .locator("[data-header-label]")
        .boundingBox();
      const button = await cells
        .nth(i)
        .locator('button[aria-label^="Filter"]')
        .boundingBox();
      expect(box && button, `column ${i}`).toBeTruthy();
      expect(box!.x + box!.width, `column ${i}`).toBeLessThanOrEqual(
        button!.x + 0.5,
      );
      // The button stays inside its cell even at 40px.
      const cell = await cells.nth(i).boundingBox();
      expect(button!.x + button!.width, `column ${i}`).toBeLessThanOrEqual(
        cell!.x + cell!.width + 0.5,
      );
    }
  });

  test("render headerContent in place of the label, with no sort button", async ({
    page,
  }) => {
    await open(page);
    const cell = headerCells(scenario(page, "headers")).nth(4);
    await expect(
      cell.getByRole("checkbox", { name: "Select all" }),
    ).toBeVisible();
    await expect(cell.getByRole("button", { name: /sortable/ })).toHaveCount(0);
    await expect(cell.locator('[title="Select"]')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Rewrite the jsdom header tests to the new contract**

In `packages/speel-react/test/v8TableHeader.test.tsx`, add the import `import { screen } from "@testing-library/react";` (merge into the existing import) and replace the test `"wraps the label instead of clipping it to one line"` with:

```tsx
it("breaks the label only at spaces and ends an over-long word in an ellipsis", () => {
  const { container } = render(
    <V8Table
      columns={[column({ sortable: true })]}
      items={items}
      onSortChange={() => undefined}
      containerWidth={300}
    />,
  );
  const box = container.querySelector<HTMLElement>("[data-header-label]");
  if (!box) throw new Error("no label box");
  expect(box.contains(label(container))).toBe(true);
  expect(box.style.whiteSpace).toBe("normal");
  expect(box.style.overflowWrap).toBe("normal");
  expect(box.style.wordBreak).toBe("normal");
  expect(box.style.overflow).toBe("hidden");
  expect(box.style.textOverflow).toBe("ellipsis");
});

it("sets the filter button beside the label rather than floating it", () => {
  const { container } = render(
    <V8Table
      columns={[column({ headerFilter: { active: false, content: null } })]}
      items={items}
      containerWidth={300}
    />,
  );
  const box = container.querySelector<HTMLElement>("[data-header-label]")!;
  expect((box.parentElement as HTMLElement).style.display).toBe("flex");
  expect(container.querySelector('[style*="float"]')).toBeNull();
});

it("renders headerContent in place of the label, never as a sort button", () => {
  const { container } = render(
    <V8Table
      columns={[
        column({
          sortable: true,
          headerContent: <input type="checkbox" aria-label="Select all" />,
        }),
      ]}
      items={items}
      onSortChange={() => undefined}
      containerWidth={300}
    />,
  );
  expect(
    screen.getByRole("checkbox", { name: "Select all" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /sortable/ })).toBeNull();
  expect(container.querySelector('[title="Response Due Date"]')).toBeNull();
});
```

- [ ] **Step 3: Run both suites to verify they fail**

Run: `npm test -w @speel/react -- --run test/v8TableHeader.test.tsx`
Expected: FAIL — no `[data-header-label]`, float present, header text rendered instead of the checkbox.
Run: `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`
Expected: the four `header labels` tests FAIL (no `[data-header-label]`); the baseline passes.

- [ ] **Step 4: Implement the flex header**

In `packages/speel-react/src/fluent-v8/primitives.tsx`, replace the `HEADER_LABEL_STYLE` doc comment and constant (lines 587-598) with:

```tsx
/**
 * The header's text box. It takes whatever the filter button leaves, and breaks a label only
 * at spaces; a word wider than the box ends in "…" (`text-overflow` applies to every line).
 * The `title` on the label is the hover for whatever is cut off. The header row grows to fit
 * the lines (see `V8Table`).
 */
const HEADER_LABEL_BOX_STYLE: React.CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "normal",
  overflowWrap: "normal",
  wordBreak: "normal",
  lineHeight: "normal",
};

/** Label box and filter button side by side, the button level with the first line. */
const HEADER_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 4,
  width: "100%",
};
```

Replace the `return (...)` of `V8HeaderCell` (lines 626-707) with:

```tsx
const label =
  column.headerContent !== undefined ? (
    // A control in the header owns its clicks: it is never wrapped in the sort button.
    column.headerContent
  ) : column.sortable && onSortChange ? (
    <span
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: "pointer",
        display: "inline",
        padding: "2px 4px",
        borderRadius: 2,
        // Each line of a wrapped label gets its own rounded hover fragment.
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
        background: hovered ? "rgba(0,0,0,0.06)" : "transparent",
      }}
      aria-label={
        sorted
          ? `${column.header}, sorted ${sort!.direction === "asc" ? "ascending" : "descending"}`
          : `${column.header}, sortable`
      }
      onClick={() => onSortChange(column.key)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSortChange(column.key);
        }
      }}
    >
      <span title={column.header}>{column.header}</span>
      {sortIcon ? (
        // An ordinary space, so a last word that fits but not with its arrow keeps the
        // line and the arrow takes the next one — the word is never cut for the arrow.
        <>
          {" "}
          <Icon
            iconName={sortIcon}
            aria-hidden
            style={{ fontSize: 12, display: "inline", verticalAlign: "middle" }}
          />
        </>
      ) : null}
    </span>
  ) : (
    <span title={column.header}>{column.header}</span>
  );
return (
  <span style={HEADER_ROW_STYLE}>
    <span data-header-label="" style={HEADER_LABEL_BOX_STYLE}>
      {label}
    </span>
    {column.headerFilter ? (
      <span style={{ flex: "none" }}>
        <V8Popover
          open={open}
          onOpenChange={setOpen}
          trigger={
            <IconButton
              iconProps={{ iconName: "Filter" }}
              styles={HEADER_FILTER_BUTTON_STYLES}
              title={`Filter ${column.header}`}
              ariaLabel={`Filter ${column.header}`}
              checked={column.headerFilter.active}
              onClick={() => setOpen((o) => !o)}
            />
          }
        >
          {column.headerFilter.content}
        </V8Popover>
      </span>
    ) : null}
  </span>
);
```

Also update the `sortIcon` comment above it: drop "the icon is inline with a label that wraps" wording only if it now misleads; the hover-only-hint reasoning still holds, keep it.

- [ ] **Step 5: Run both suites to verify they pass**

Run: `npm test -w @speel/react`
Expected: all PASS.
Run: `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/speel-react/src/fluent-v8/primitives.tsx packages/speel-react/test/v8TableHeader.test.tsx samples/spfx-sample/tests/layout
git add packages/speel-react/src/fluent-v8/primitives.tsx packages/speel-react/test/v8TableHeader.test.tsx samples/spfx-sample/tests/layout
git commit -m "fix(react): v8 header labels break only at spaces, beside the filter button; headerContent (#62 #57)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 6: v8 widths — hold at the default, never below the header floor (#64 skin)

**Files:**

- Create: `packages/speel-react/src/fluent-v8/headerFloor.ts`
- Modify: `packages/speel-react/src/fluent-v8/columnBounds.ts`
- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx:2-38` (import `FontWeights`), `:788-836` (`V8Table` columns + content sum)
- Modify: `packages/speel-react/test/columnBounds.test.ts`
- Modify: `packages/speel-react/test/v8TableWidths.test.tsx`
- Test: `packages/speel-react/test/headerFloor.test.ts` (create)
- Modify: `samples/spfx-sample/tests/layout/fixture.tsx` (scenario `floor`), `tableLayout.spec.ts`

**Interfaces:**

- Consumes: `TableColumn.defaultWidth` (Task 2), `TableColumn.headerContent` (Task 3), `[data-header-label]` (Task 5).
- Produces:

  ```ts
  // fluent-v8/headerFloor.ts
  export const SORT_LABEL_PADDING = 8;
  export const SORT_ARROW_ROOM = 16;
  export const FILTER_BUTTON_ROOM = 28;
  export function headerFloor(
    column: TableColumn,
    sortLabel: boolean,
    measure: (text: string) => number,
  ): number;
  export function textMeasurer(
    font: string,
    fontSizePx: number,
  ): (text: string) => number;
  // fluent-v8/columnBounds.ts
  export function heldWidth(
    width: number | undefined,
    defaultWidth: number | undefined,
    floor: number,
  ): number;
  export function columnBounds(held: number): {
    minWidth: number;
    maxWidth: number;
  };
  ```

- [ ] **Step 1: Write the failing unit tests**

Create `packages/speel-react/test/headerFloor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  FILTER_BUTTON_ROOM,
  SORT_ARROW_ROOM,
  SORT_LABEL_PADDING,
  headerFloor,
  textMeasurer,
} from "../src/fluent-v8/headerFloor.js";
import type { TableColumn } from "../src/adapter/SpeelUIAdapter.js";

/** 10px a character: easy arithmetic. */
const measure = (text: string): number => text.length * 10;
const column = (extra: Partial<TableColumn>): TableColumn => ({
  key: "k",
  header: "Separation Date",
  render: () => "",
  ...extra,
});
const filter = { headerFilter: { active: false, content: null } };

describe("headerFloor", () => {
  it("is the longest word plus the label padding", () => {
    expect(headerFloor(column({}), false, measure)).toBe(
      100 + SORT_LABEL_PADDING,
    );
  });

  it("adds room for the sort arrow and the filter button", () => {
    expect(headerFloor(column(filter), true, measure)).toBe(
      100 + SORT_LABEL_PADDING + SORT_ARROW_ROOM + FILTER_BUTTON_ROOM,
    );
  });

  it("is only the filter room for a header with no words, and 0 without one", () => {
    expect(headerFloor(column({ header: "" }), false, measure)).toBe(0);
    expect(headerFloor(column({ header: " ", ...filter }), true, measure)).toBe(
      FILTER_BUTTON_ROOM,
    );
  });

  it("is 0 for a column whose header is content, not text", () => {
    expect(
      headerFloor(column({ headerContent: "x", ...filter }), true, measure),
    ).toBe(0);
  });

  it("rounds up to whole pixels", () => {
    expect(headerFloor(column({ header: "ab" }), false, () => 10.2)).toBe(
      Math.ceil(10.2 + SORT_LABEL_PADDING),
    );
  });
});

describe("textMeasurer", () => {
  it("estimates per character where there is no canvas (jsdom)", () => {
    const m = textMeasurer("600 14px Arial", 14);
    expect(m("Supervisor")).toBeCloseTo(10 * 0.6 * 14);
  });
});
```

Replace `packages/speel-react/test/columnBounds.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import {
  columnBounds,
  heldWidth,
  MIN_RESIZE_WIDTH,
} from "../src/fluent-v8/columnBounds.js";

describe("heldWidth", () => {
  it("holds an authored, view or dragged width as given — even under the floor", () => {
    expect(heldWidth(60, 180, 140)).toBe(60);
  });

  it("holds a column with no width at its default", () => {
    expect(heldWidth(undefined, 180, 50)).toBe(180);
  });

  it("raises the default to the header floor", () => {
    expect(heldWidth(undefined, 70, 136)).toBe(136);
  });

  it("falls back to 100 when there is no default either", () => {
    expect(heldWidth(undefined, undefined, 0)).toBe(100);
  });
});

describe("columnBounds", () => {
  it("lets a sized column shrink as well as grow", () => {
    // Regression: minWidth was the CURRENT width, and DetailsList clamps a drag to minWidth,
    // so a column could only ever get wider — each drag raised its own floor.
    const bounds = columnBounds(200);
    expect(bounds.minWidth).toBe(MIN_RESIZE_WIDTH);
    expect(bounds.maxWidth).toBe(200);
  });

  it("never floors above the held width", () => {
    const bounds = columnBounds(30);
    expect(bounds.minWidth).toBeLessThanOrEqual(30);
    expect(bounds.maxWidth).toBe(30);
  });
});
```

In `packages/speel-react/test/v8TableWidths.test.tsx`, add inside the `describe`:

```tsx
/** A last column that overflows the container, so nothing stretches into slack. */
const filler: TableColumn = {
  key: "filler",
  header: "F",
  render: () => "",
  width: 300,
};

it("holds a column with no width at its default hint", () => {
  const { container } = render(
    <V8Table
      columns={[{ ...cols([undefined])[0]!, defaultWidth: 70 }, filler]}
      items={items}
      containerWidth={100}
    />,
  );
  expect(headerWidths(container)).toEqual([90, 320]);
});

it("raises a defaulted column to its header floor, and leaves an authored one alone", () => {
  const long: TableColumn = {
    key: "c0",
    header: "Separation Date Confirmed",
    render: () => "",
    defaultWidth: 70,
    sortable: true,
    headerFilter: { active: false, content: null },
  };
  const { container } = render(
    <V8Table
      columns={[long, { ...long, key: "authored", width: 60 }, filler]}
      items={items}
      onSortChange={() => undefined}
      containerWidth={100}
    />,
  );
  // jsdom has no canvas: "Separation" estimates at 10 × 0.6 × 14px = 84, plus 8 + 16 + 28.
  const floor = Math.ceil(84 + 8 + 16 + 28);
  const widths = headerWidths(container);
  expect(widths[0]).toBe(floor + 20);
  expect(widths[1]).toBe(60 + 20);
});
```

- [ ] **Step 2: Add the failing layout scenario and test**

In `fixture.tsx` append to `scenarios`:

```tsx
  {
    name: "floor",
    containerWidth: 1200,
    columns: [
      col("done", "Done", { defaultWidth: 70 }),
      col("long", "Separation Date Confirmed", {
        defaultWidth: 70,
        sortable: true,
        headerFilter: filter,
      }),
      col("authored", "Separation Date Confirmed", {
        width: 60,
        sortable: true,
        headerFilter: filter,
      }),
      col("filler", "Filler", { width: 50 }),
    ],
    items: [{ done: "Yes", long: "x", authored: "x", filler: "x" }],
  },
```

In `tableLayout.spec.ts` add:

```ts
test.describe("default widths", () => {
  test("hold a column at its default hint when the header fits", async ({
    page,
  }) => {
    await open(page);
    expect(
      await widthOf(headerCells(scenario(page, "floor")).nth(0)),
    ).toBeCloseTo(90, 0);
  });

  test("raise a defaulted column until its longest header word fits", async ({
    page,
  }) => {
    await open(page);
    const cell = headerCells(scenario(page, "floor")).nth(1);
    const box = cell.locator("[data-header-label]");
    expect(await box.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    const lines = await box.evaluate(lineTexts);
    expect(wordsWhole(lines, "Separation Date Confirmed")).toBe(true);
    expect(await widthOf(cell)).toBeGreaterThan(90);
  });

  test("leave an authored width alone, even under the floor", async ({
    page,
  }) => {
    await open(page);
    expect(
      await widthOf(headerCells(scenario(page, "floor")).nth(2)),
    ).toBeCloseTo(80, 0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w @speel/react -- --run test/headerFloor.test.ts test/columnBounds.test.ts test/v8TableWidths.test.tsx`
Expected: FAIL — missing `headerFloor.js`; `heldWidth` arity; widths 100 instead of 70/floor.
Run: `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`
Expected: `default widths` tests FAIL (column held at 100).

- [ ] **Step 4: Implement `headerFloor` and `textMeasurer`**

Create `packages/speel-react/src/fluent-v8/headerFloor.ts`:

```ts
import type { TableColumn } from "../adapter/SpeelUIAdapter.js";

/** The sort label's horizontal padding (2px 4px). */
export const SORT_LABEL_PADDING = 8;
/** A space and the 12px sort arrow after the last word. */
export const SORT_ARROW_ROOM = 16;
/** The 24px filter button and the 4px gap before it. */
export const FILTER_BUTTON_ROOM = 28;

/**
 * The narrowest a column held at its default may be: its longest header word, plus what the
 * header puts around it. A defaulted Boolean titled "Separation Date" gets room for
 * "Separation" instead of 70px. Authored, view and dragged widths never consult this, and a
 * header that is content rather than text has nothing to measure.
 */
export function headerFloor(
  column: TableColumn,
  sortLabel: boolean,
  measure: (text: string) => number,
): number {
  if (column.headerContent !== undefined) return 0;
  const filter = column.headerFilter ? FILTER_BUTTON_ROOM : 0;
  const words = column.header.split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return filter;
  const longest = Math.max(...words.map(measure));
  return Math.ceil(
    longest + SORT_LABEL_PADDING + (sortLabel ? SORT_ARROW_ROOM : 0) + filter,
  );
}

interface TextContext {
  font: string;
  measureText(text: string): { width: number };
}
type OffscreenCanvasCtor = new (
  width: number,
  height: number,
) => { getContext(kind: "2d"): TextContext | null };

const measurers = new Map<string, (text: string) => number>();

/**
 * Measures text in `font` (a CSS font shorthand), cached per font. Uses `OffscreenCanvas`
 * where the browser has one; elsewhere — jsdom, old browsers — estimates 0.6em a character,
 * which is close enough for a floor and needs no canvas in tests.
 */
export function textMeasurer(
  font: string,
  fontSizePx: number,
): (text: string) => number {
  const cached = measurers.get(font);
  if (cached) return cached;
  const OC = (globalThis as { OffscreenCanvas?: OffscreenCanvasCtor })
    .OffscreenCanvas;
  const ctx = OC ? new OC(1, 1).getContext("2d") : null;
  let measure: (text: string) => number;
  if (ctx) {
    ctx.font = font;
    measure = (text) => ctx.measureText(text).width;
  } else {
    measure = (text) => text.length * 0.6 * fontSizePx;
  }
  measurers.set(font, measure);
  return measure;
}
```

- [ ] **Step 5: Change `columnBounds.ts`**

Replace `packages/speel-react/src/fluent-v8/columnBounds.ts` with:

```ts
/** How narrow a user may drag a column. Below this a header is unreadable, not useful. */
export const MIN_RESIZE_WIDTH = 40;

/** The width of a column with neither a width nor a default of its own. */
const DEFAULT_WIDTH = 100;

/**
 * The width a column is actually held at: a live drag or a view/descriptor width when there is
 * one — the table hands those in as `width`, and they win as given. Otherwise the column's
 * default (its field kind's, from `TableColumn.defaultWidth`), raised to the header floor so
 * its longest header word fits.
 */
export function heldWidth(
  width: number | undefined,
  defaultWidth: number | undefined,
  floor: number,
): number {
  return width ?? Math.max(defaultWidth ?? DEFAULT_WIDTH, floor);
}

/**
 * `DetailsList`'s min/max bounds for a column held at `held`.
 *
 * `minWidth` must be a genuine floor, never the column's current width: `DetailsList` clamps
 * a resize drag to `minWidth`, so binding it to the current width means every drag raises the
 * column's own floor and the column can only ever grow.
 *
 * The held width rides in `maxWidth`, which is where the justified layout pass stops growing
 * a column — so every column gets its held width and no more, and only the last one absorbs
 * whatever the container has left over. A column with no `maxWidth` would swallow that slack
 * whole and starve the columns after it.
 */
export function columnBounds(held: number): {
  minWidth: number;
  maxWidth: number;
} {
  return { minWidth: Math.min(MIN_RESIZE_WIDTH, held), maxWidth: held };
}
```

- [ ] **Step 6: Use them in `V8Table`**

In `packages/speel-react/src/fluent-v8/primitives.tsx`: add `FontWeights,` to the `@fluentui/react` import list and `import { headerFloor, textMeasurer } from "./headerFloor.js";` after the `columnBounds` import.

In `V8Table`, after the `if (p.items.length === 0) return ...` line and before `const columns: IColumn[] = ...`, insert:

```tsx
// The font DetailsColumn renders a header name in: semibold, at the medium size.
const headerFont = theme.fonts.medium;
const headerSize =
  typeof headerFont.fontSize === "number"
    ? headerFont.fontSize
    : parseFloat(headerFont.fontSize ?? "14");
const measure = textMeasurer(
  `${FontWeights.semibold} ${headerSize}px ${headerFont.fontFamily ?? "sans-serif"}`,
  headerSize,
);
const held = p.columns.map((c) =>
  heldWidth(
    c.width,
    c.defaultWidth,
    headerFloor(
      c,
      c.sortable === true &&
        p.onSortChange !== undefined &&
        c.headerContent === undefined,
      measure,
    ),
  ),
);
```

Change the columns map to take the index — `p.columns.map((c, i) => ({` — and replace `...columnBounds(c.width),` with `...columnBounds(held[i]!),`.

Replace the `content` reduce with:

```tsx
const content = held.reduce((sum, w) => sum + w + CELL_PADDING, 0);
```

- [ ] **Step 7: Run both suites to verify they pass**

Run: `npm test -w @speel/react`
Expected: all PASS (the existing "default floor" test still gets 120 for a "C0" header).
Run: `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`
Expected: 8 passed.

- [ ] **Step 8: Commit**

```bash
npx prettier --write packages/speel-react/src/fluent-v8/headerFloor.ts packages/speel-react/src/fluent-v8/columnBounds.ts packages/speel-react/src/fluent-v8/primitives.tsx packages/speel-react/test/headerFloor.test.ts packages/speel-react/test/columnBounds.test.ts packages/speel-react/test/v8TableWidths.test.tsx samples/spfx-sample/tests/layout
git add packages/speel-react/src/fluent-v8/headerFloor.ts packages/speel-react/src/fluent-v8/columnBounds.ts packages/speel-react/src/fluent-v8/primitives.tsx packages/speel-react/test/headerFloor.test.ts packages/speel-react/test/columnBounds.test.ts packages/speel-react/test/v8TableWidths.test.tsx samples/spfx-sample/tests/layout
git commit -m "feat(react): v8 holds defaulted columns at their kind's width, never below the header's longest word (#64)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 7: v8 body cells — `wrap` and the cut-off hover title (#63, #66 skin)

**Files:**

- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (cell styles + `V8Cell` above `V8Table`; `isMultiline` and `onRender` in the columns map)
- Test: `packages/speel-react/test/v8TableCells.test.tsx` (create)
- Modify: `samples/spfx-sample/tests/layout/fixture.tsx` (scenario `cells`), `tableLayout.spec.ts`

**Interfaces:**

- Consumes: `TableColumn.wrap`, `TableColumn.cellTitle` (Task 3), `setOverflowTitle` from `../table/overflowTitle.js` (Task 3).
- Produces: v8 cells for columns with `cellTitle` or `wrap` render inside a `div` wrapper (first child of `[data-automationid="DetailsRowCell"]`).

- [ ] **Step 1: Write the failing jsdom tests**

Create `packages/speel-react/test/v8TableCells.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { V8Table } from "../src/fluent-v8/primitives.js";
import type { TableColumn } from "../src/adapter/SpeelUIAdapter.js";

const items = [{ c: "Bartholomew Longname" }];
const column = (extra: Partial<TableColumn>): TableColumn => ({
  key: "c",
  header: "Name",
  width: 80,
  render: (row: unknown) => <b>{(row as { c: string }).c}</b>,
  ...extra,
});
const cellContent = (container: HTMLElement): HTMLElement =>
  container.querySelector<HTMLElement>('[data-automationid="DetailsRowCell"]')!
    .firstElementChild as HTMLElement;
/** jsdom has no layout: report the sizes a browser would for a cut-off or fitting cell. */
function sized(
  el: HTMLElement,
  scrollWidth: number,
  clientWidth: number,
): void {
  Object.defineProperty(el, "scrollWidth", {
    value: scrollWidth,
    configurable: true,
  });
  Object.defineProperty(el, "clientWidth", {
    value: clientWidth,
    configurable: true,
  });
}

describe("V8Table body cells", () => {
  it("titles a cut-off cell with its text on hover", () => {
    const { container } = render(
      <V8Table
        columns={[column({ cellTitle: (r) => (r as { c: string }).c })]}
        items={items}
        containerWidth={300}
      />,
    );
    const el = cellContent(container);
    sized(el, 200, 80);
    fireEvent.mouseEnter(el);
    expect(el.title).toBe("Bartholomew Longname");
  });

  it("gives a cell that fits no title", () => {
    const { container } = render(
      <V8Table
        columns={[column({ cellTitle: (r) => (r as { c: string }).c })]}
        items={items}
        containerWidth={300}
      />,
    );
    const el = cellContent(container);
    sized(el, 80, 80);
    fireEvent.mouseEnter(el);
    expect(el.hasAttribute("title")).toBe(false);
  });

  it("keeps an un-titled, unwrapped column's content as rendered", () => {
    const { container } = render(
      <V8Table columns={[column({})]} items={items} containerWidth={300} />,
    );
    expect(cellContent(container).tagName).toBe("B");
  });

  it("wraps a wrap column at spaces and ends an over-long word in an ellipsis", () => {
    const { container } = render(
      <V8Table
        columns={[column({ wrap: true })]}
        items={items}
        containerWidth={300}
      />,
    );
    const el = cellContent(container);
    expect(el.tagName).toBe("DIV");
    expect(el.style.whiteSpace).toBe("normal");
    expect(el.style.overflowWrap).toBe("normal");
    expect(el.style.wordBreak).toBe("normal");
    expect(el.style.textOverflow).toBe("ellipsis");
  });

  it("keeps a titled single-line column on one line", () => {
    const { container } = render(
      <V8Table
        columns={[column({ cellTitle: () => "x" })]}
        items={items}
        containerWidth={300}
      />,
    );
    expect(cellContent(container).style.whiteSpace).toBe("nowrap");
  });
});
```

- [ ] **Step 2: Add the failing layout scenario and tests**

In `fixture.tsx` append to `scenarios`:

```tsx
  {
    name: "cells",
    containerWidth: 1200,
    columns: [
      col("org", "Organization", {
        width: 120,
        wrap: true,
        cellTitle: (r) => (r as Row)["org"] ?? "",
      }),
      col("name", "Name", { width: 80, cellTitle: (r) => (r as Row)["name"] ?? "" }),
      col("filler", "Filler", { width: 50 }),
    ],
    items: [
      { org: "Alpha Beta Gamma Delta Epsilon", name: "Bartholomew Longname", filler: "" },
      { org: "Short", name: "Al", filler: "" },
      { org: "Pneumonoultramicroscopic", name: "Al", filler: "" },
    ],
  },
```

In `tableLayout.spec.ts` add:

```ts
test.describe("body cells", () => {
  const content = (page: Page, row: number, col: number): Locator =>
    rowCells(scenario(page, "cells"), row).nth(col).locator(":scope > div");

  test("a wrap column breaks at spaces and its row grows", async ({ page }) => {
    await open(page);
    const lines = await content(page, 0, 0).evaluate(lineTexts);
    expect(lines.length).toBeGreaterThan(1);
    expect(wordsWhole(lines, "Alpha Beta Gamma Delta Epsilon")).toBe(true);
    const rows = scenario(page, "cells").locator(
      '[data-automationid="DetailsRow"]',
    );
    const tall = await rows.nth(0).boundingBox();
    const short = await rows.nth(1).boundingBox();
    expect(tall!.height).toBeGreaterThan(short!.height);
  });

  test("a word wider than a wrap column ends in an ellipsis instead of breaking", async ({
    page,
  }) => {
    await open(page);
    const el = content(page, 2, 0);
    expect(await el.evaluate(lineTexts)).toHaveLength(1);
    expect(await el.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  });

  test("hovering a cut-off cell shows its full text; a cell that fits shows none", async ({
    page,
  }) => {
    await open(page);
    const cut = content(page, 0, 1);
    await cut.hover();
    await expect(cut).toHaveAttribute("title", "Bartholomew Longname");
    const fits = content(page, 1, 1);
    await fits.hover();
    expect(await fits.getAttribute("title")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w @speel/react -- --run test/v8TableCells.test.tsx`
Expected: FAIL — content is the `<b>` itself, no title, no wrapper styles.
Run: `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`
Expected: `body cells` tests FAIL.

- [ ] **Step 4: Implement `V8Cell` and `isMultiline`**

In `packages/speel-react/src/fluent-v8/primitives.tsx` add `import { setOverflowTitle } from "../table/overflowTitle.js";` with the other relative imports, and insert above `export function V8Table(`:

```tsx
/** A single-line cell: cut off with an ellipsis, as DetailsList's own cell style does. */
const CELL_LINE_STYLE: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * A wrapping cell: the header's rule — break only at spaces, and end a word wider than the
 * column in "…" — rather than Fluent's `isMultiline` `word-break: break-word`.
 */
const CELL_WRAP_STYLE: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "normal",
  overflowWrap: "normal",
  wordBreak: "normal",
};

/**
 * A cell's content in a box the skin can measure: on hover, a cut-off cell gets its full text
 * as a title. Only for columns that wrap or have a title — the rest (the actions column)
 * render bare, so nothing clips their buttons' focus rings.
 */
function V8Cell({
  column,
  row,
}: {
  column: TableColumn;
  row: unknown;
}): JSX.Element {
  const { cellTitle } = column;
  return (
    <div
      style={column.wrap ? CELL_WRAP_STYLE : CELL_LINE_STYLE}
      {...(cellTitle
        ? {
            onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) =>
              setOverflowTitle(e.currentTarget, () => cellTitle(row)),
          }
        : {})}
    >
      {column.render(row)}
    </div>
  );
}
```

In the `V8Table` columns map, replace `onRender: (item: unknown) => c.render(item),` with:

```tsx
    // A wrapping column lets DetailsList grow the row; V8Cell sets how the text breaks.
    ...(c.wrap ? { isMultiline: true } : {}),
    onRender: (item: unknown) =>
      c.cellTitle || c.wrap ? <V8Cell column={c} row={item} /> : c.render(item),
```

- [ ] **Step 5: Run both suites to verify they pass**

Run: `npm test -w @speel/react`
Expected: all PASS.
Run: `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`
Expected: 11 passed.

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/speel-react/src/fluent-v8/primitives.tsx packages/speel-react/test/v8TableCells.test.tsx samples/spfx-sample/tests/layout
git add packages/speel-react/src/fluent-v8/primitives.tsx packages/speel-react/test/v8TableCells.test.tsx samples/spfx-sample/tests/layout
git commit -m "feat(react): v8 wrap columns break at spaces; cut-off cells show their text on hover (#63 #66)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 8: shadcn registry skin — `headerContent`, `wrap`, hover title

**Files:**

- Modify: `registry/src/speel-shadcn/table.tsx`
- Test: `registry/tests/table.test.tsx` (create)
- Regenerate: `registry/public/r/*.json` (`registry:build`)
- Sync: `samples/spfx-sample/src/components/speel/table.tsx` (`npm run sync:skin`)

**Interfaces:**

- Consumes: `TableColumn.headerContent`, `.wrap`, `.cellTitle` and `setOverflowTitle` from `@speel/react` (Tasks 2–3; build `@speel/react` first). `defaultWidth` is deliberately ignored (shadcn sizes to content); the actions column already arrives with no `width` (Task 2).

- [ ] **Step 1: Write the failing registry tests**

Create `registry/tests/table.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { shadcnAdapter } from "@/speel-shadcn/adapter";

const T = shadcnAdapter.Table;
const items = [{ name: "Bartholomew Longname" }];
const text = (r: unknown): string => (r as { name: string }).name;

describe("shadcn Table column options", () => {
  it("renders headerContent in place of the header, never as a sort button", () => {
    render(
      <T
        columns={[
          {
            key: "s",
            header: "Select",
            sortable: true,
            headerContent: <input type="checkbox" aria-label="Select all" />,
            render: () => "x",
          },
        ]}
        items={items}
        onSortChange={() => undefined}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Select all" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sortable/ })).toBeNull();
  });

  it("lets a wrap column's cells wrap instead of truncating", () => {
    const { container } = render(
      <T
        columns={[
          { key: "n", header: "N", width: 80, wrap: true, render: text },
        ]}
        items={items}
      />,
    );
    const td = container.querySelector("td")!;
    expect(td.className).toContain("whitespace-normal");
    expect(td.className).not.toContain("truncate");
  });

  it("titles a cut-off cell with its text on hover", () => {
    const { container } = render(
      <T
        columns={[
          { key: "n", header: "N", width: 80, render: text, cellTitle: text },
        ]}
        items={items}
      />,
    );
    const td = container.querySelector("td")!;
    Object.defineProperty(td, "scrollWidth", { value: 200 });
    Object.defineProperty(td, "clientWidth", { value: 80 });
    fireEvent.mouseEnter(td);
    expect(td.title).toBe("Bartholomew Longname");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run build -w @speel/react && npm --prefix registry test -- --run tests/table.test.tsx`
Expected: FAIL — header text instead of checkbox, `truncate` on the wrap cell, no title.

- [ ] **Step 3: Implement in the skin**

In `registry/src/speel-shadcn/table.tsx`:

- Imports: change `import type { ReactElement, ReactNode } from "react";` to `import type { MouseEvent, ReactElement, ReactNode } from "react";` and `import { useResizable } from "@speel/react";` to `import { setOverflowTitle, useResizable } from "@speel/react";`.
- In `HeaderCell`, replace the opening `{column.sortable && onSortChange ? (` conditional with a three-way one:

```tsx
      {column.headerContent !== undefined ? (
        // A control in the header owns its clicks: it is never wrapped in the sort button.
        <span className="min-w-0 grow">{column.headerContent as ReactNode}</span>
      ) : column.sortable && onSortChange ? (
```

(the sort `<button>` branch and the plain-label branch that follow are unchanged).

- Replace the body `<TableCell ...>` with:

```tsx
                  <TableCell
                    key={c.key}
                    className={cn(
                      c.wrap
                        ? "whitespace-normal"
                        : c.width !== undefined && "truncate",
                    )}
                    {...(c.cellTitle
                      ? {
                          onMouseEnter: (
                            e: MouseEvent<HTMLTableCellElement>,
                          ) =>
                            setOverflowTitle(e.currentTarget, () =>
                              c.cellTitle!(row),
                            ),
                        }
                      : {})}
                  >
```

- [ ] **Step 4: Run the registry gates**

Run: `npm --prefix registry run typecheck && npm --prefix registry test`
Expected: clean typecheck; all tests PASS (including `adapter.smoke.test.tsx`).

- [ ] **Step 5: Regenerate the registry JSON and sync the sample's copy**

Run: `npm --prefix registry run registry:build && npm run sync:skin && npm run check:skin`
Expected: `registry/public/r/*.json` and `samples/spfx-sample/src/components/speel/table.tsx` updated; `check:skin` reports no drift.

- [ ] **Step 6: Prove the sample builds**

Run: `npm --prefix samples/spfx-sample run build:check`
Expected: heft build succeeds.

- [ ] **Step 7: Commit**

```bash
npx prettier --write registry/src/speel-shadcn/table.tsx registry/tests/table.test.tsx samples/spfx-sample/src/components/speel/table.tsx
git add registry/src/speel-shadcn/table.tsx registry/tests/table.test.tsx registry/public/r samples/spfx-sample/src/components/speel/table.tsx
git commit -m "feat(registry): shadcn table headerContent, wrap, and cut-off hover titles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

(If prettier rewrites `table.tsx` after `sync:skin`, re-run `npm run sync:skin` so the two copies match, then `npm run check:skin`.)

---

### Task 9: Docs delta, changeset, full verify (controller, inline)

The branch's single document step (CLAUDE.md "Documentation system"). Done by the controller, who holds the whole branch's context.

**Files:**

- Create: `packages/speel-react/docs/table-columns.md`
- Modify: `packages/speel-react/docs/tables.md` (Columns section → short pointer; "Columns keep their widths" gotcha)
- Modify: `packages/speel-react/docs/skins.md:116-118` (Table paragraph — page is at its 250-line cap, so rewrite in place without adding lines)
- Modify: `packages/speel-react/README.md` (TOC line after Tables)
- Create: `.changeset/table-columns.md`

- [ ] **Step 1: Write `docs/table-columns.md`** — four H2s in order (What & when / Canonical example / Capabilities / Boundaries & gotchas), 100–250 lines, capabilities and idioms only (no option-bag listings). Canonical example: the spec's Usage block adapted to a `Project` entity (`p.Title`, `p.Owner.with({ width: 170 })`, `p.Notes.with({ wrap: true })`, a custom select column with `header` + `headerContent`). Capabilities: column refs and `.with()`; the descriptor array form and custom columns (moved from `tables.md`, including the masked-value override paragraph); default widths by field kind and the header floor (v8); `wrap`; hover titles and `cellTitle: false`; `headerContent` and why `header` stays. Gotchas: the `(p: Entity) =>` annotation no longer compiles; `headerContent` columns don't sort from the header; shadcn sizes to content and ignores default widths; header labels break only at spaces, an over-long word ends in "…" (moved from `tables.md`). Re-verify every identifier in the example against `packages/speel-react/src/index.ts` exports — read the file, not memory.
- [ ] **Step 2: Trim `tables.md`** — replace the "### Columns" subsection's descriptor detail with two sentences and the one-line proxy example, linking `[table columns](table-columns.md)`; restate the last gotcha (widths by field kind, header breaks at spaces). Confirm the page still has four H2s and stays ≤ 250 lines (`wc -l`).
- [ ] **Step 3: `skins.md`** — rewrite the Table paragraph to name the optional `TableColumn` hints a skin may honour (`defaultWidth`, `wrap`, `cellTitle` with `setOverflowTitle`, `headerContent`) in the same three lines. `wc -l` must stay ≤ 250.
- [ ] **Step 4: README TOC** — after the Tables entry: `- [Table columns](docs/table-columns.md) — read when a column needs a width, a different header or cell, wrapping, or a control in its header.`
- [ ] **Step 5: Changeset** — create `.changeset/table-columns.md`:

```md
---
"@speel/react": minor
---

Table columns: `p.Field.with({ width, wrap, … })` gives a proxy column options without a string key — the `columns` callback's parameter is now a map of column refs, so drop any `(p: Entity) =>` annotation. New column options `wrap`, `cellTitle: false` and `headerContent`. The Fluent v8 skin holds a column without a width at a default for its field kind, never narrower than its header's longest word; header labels break only at spaces (an over-long word ends in "…") with the filter button beside them; cut-off cells show their full text on hover. The row-actions column is as wide as its buttons. `TableColumn` gains optional `defaultWidth`, `wrap`, `cellTitle` and `headerContent`, and `setOverflowTitle` is exported for skins.
```

- [ ] **Step 6: Full gate** — `npm run format:check && npm run verify` (verify now ends with `test:layout`). Expected: green.
- [ ] **Step 7: Commit** — `docs: table columns topic page; changeset (#57 #62 #63 #64 #65 #66 #67)` with the two trailer lines.
- [ ] **Step 8: Live check (human)** — ask the user to look at the sample dashboard in SharePoint (`npm --prefix samples/spfx-sample run dev`, outside the sandbox): headers, default widths, wrap and hover titles under Segoe UI and the real theme.
