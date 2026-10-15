# Codec per-element rule, overlay focus return, popover semantics, label-less fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix #69 (codec element-wise on single-valued columns), #71 (overlay close scrolls the page), #72 (popover semantics/keyboard), #76 (label-less field primitives), #77 (closed Dropdown arrow keys).

**Architecture:** Core gets one config-based predicate that every codec site follows. `@speel/react` gets two skin-support hooks (`useFocusReturn`, `usePopoverFocus`) that both skins wire onto their own primitives, plus additive contract fields (`returnFocus`, popover `label` + trigger function, button aria fields, `FieldChrome.ariaLabel`, `placeholder`, `autoGrow`, `IconButton.ariaLabel`) threaded through the surfaces and `SpeelField`.

**Tech Stack:** TypeScript (NodeNext, `exactOptionalPropertyTypes`), React 17, Fluent UI v8 (8.125.6), Radix/shadcn (registry), vitest 1.6 (packages) / 3 (registry), RTL 12.

**Spec:** `docs/superpowers/specs/2026-10-15-codec-rule-and-overlay-a11y-design.md`

## Global Constraints

- Public repo: no consumer app, org, tenant or account names in code, tests, docs or commit messages.
- Relative imports in `packages/*/src` carry `.js` (`./focusReturn.js`); `npm run check:node-esm` gates it.
- `exactOptionalPropertyTypes` is on: pass optional props with conditional spreads (`...(x !== undefined ? { x } : {})`), never `x={undefined}` onto an optional non-`| undefined` prop.
- Every adapter-contract change is optional and additive; a plain `ReactNode` popover trigger keeps working.
- shadcn components are authored in `registry/` first; the sample copy is regenerated with `npm run sync:skin`, never edited by hand. `registry/public/r` JSON is regenerated (`npm --prefix registry run registry:build`) and committed.
- `registry/` and the sample resolve `@speel/react` through the built `dist` — run `npm run build` after changing `packages/speel-react/src` and before registry tests/typecheck.
- New `SpeelUIAdapter` members/props go in the v8 skin, the shadcn skin and `test/fakeAdapter.tsx`.
- Docs: topic pages keep exactly four H2s and 100–250 lines; document step runs once, last.
- Changeset: one file, `@speel/core: patch`, `@speel/react: minor`.

## Review Focus

1. **A surface whose opener is removed while it is open** (the panel deleted its own row) — closing must not throw and must not focus `body`. Pinned in Task 4 ("opener removed before close").
2. **`returnFocus: false`** — no focus call at all on close, which also proves Fluent's own restore is off. Pinned in Task 4 and Task 11.
3. **A popover with nothing focusable inside** — Tab must still close it and return to the trigger, not leave focus stranded. Pinned in Task 5.
4. **A multi-valued column whose model is not an array** (a codec that models a multi-Choice as a comma string) — the codec runs once on the whole value. Pinned in Task 1.
5. **A label AND an `ariaLabel` on the same primitive** — the visible label names it. Pinned in Task 8.

---

### Task 1: Core — config-based codec rule (#69)

**Files:**

- Create: `packages/speel-core/src/Metadata/columnValue.ts`
- Modify: `packages/speel-core/src/Save/PayloadBuilder.ts:5-26`
- Modify: `packages/speel-core/src/Query/Materialize.ts:55-59`
- Modify: `packages/speel-core/src/ModelBuilder/fieldTypes/shapeCodec.ts:222-232, 265-274`
- Test: `packages/speel-core/test/unit/Save/codecPerElement.test.ts`

**Interfaces:**

- Produces: `isMultiValued(config: FieldConfig): boolean`, `mapColumnValue(config: FieldConfig, value: unknown, fn: (v: unknown) => unknown): unknown` (internal, not exported from the package index).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/speel-core/test/unit/Save/codecPerElement.test.ts
import { describe, it, expect } from "vitest";
import { PayloadBuilder } from "../../../src/Save/PayloadBuilder.js";
import { Materialize } from "../../../src/Query/Materialize.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property, type IValueCodec } from "../../../src/Metadata/Property.js";
import type { FieldConfig } from "../../../src/Metadata/FieldConfig.js";
import type { IWriteField } from "../../../src/providers/ISharePointProvider.js";
import {
  ModelBuilder,
  Entity,
  JsonShape,
  JsonField,
  NoteField,
  TextField,
} from "../../../src/index.js";

interface Def {
  propertyName: string;
}

const jsonArray: IValueCodec = {
  toProvider: (v) => JSON.stringify(v),
  fromProvider: (s) => JSON.parse(s as string) as unknown,
};

const NOTE: FieldConfig = { kind: "Text", multiline: true };
const TEXT: FieldConfig = { kind: "Text", multiline: false };
const MULTI_CHOICE: FieldConfig = {
  kind: "Choice",
  multi: true,
  fillIn: false,
  radioButtons: false,
};
// PayloadBuilder/Materialize read only `kind` and `multi`; a real target is not needed.
const MULTI_LOOKUP = { kind: "Lookup", multi: true } as unknown as FieldConfig;

class Row {
  Id?: number;
  Value?: unknown;
}

function typeWith(config: FieldConfig, codec: IValueCodec): EntityType<Row> {
  return new EntityType<Row>({
    ctor: Row,
    list: { kind: "title", value: "Rows" },
    properties: [
      new Property({
        propertyName: "Id",
        columnName: "ID",
        displayName: "ID",
        config: { kind: "Number" },
        required: true,
        readOnly: true,
        key: true,
      }),
      new Property({
        propertyName: "Value",
        columnName: "Value",
        displayName: "Value",
        config,
        required: false,
        readOnly: false,
        key: false,
        codec,
      }),
    ],
  });
}

const byColumn = (fields: readonly IWriteField[]): Record<string, unknown> =>
  Object.fromEntries(fields.map((f) => [f.property.columnName, f.value]));

const row = (value: unknown): Row => Object.assign(new Row(), { Value: value });

describe("a codec on a single-valued column runs once, on the whole value", () => {
  const defs: Def[] = [{ propertyName: "username" }];
  const wire = '[{"propertyName":"username"}]';

  it("a Note column with an array model writes one string on add", () => {
    expect(
      byColumn(
        PayloadBuilder.buildForAdd(row(defs), typeWith(NOTE, jsonArray)),
      ),
    ).toEqual({ Value: wire });
  });

  it("a Note column with an array model writes one string on update", () => {
    expect(
      byColumn(
        PayloadBuilder.buildForUpdate(row(defs), typeWith(NOTE, jsonArray), [
          "Value",
        ]),
      ),
    ).toEqual({ Value: wire });
  });

  it("a single-line Text column with an array model writes one string", () => {
    expect(
      byColumn(
        PayloadBuilder.buildForAdd(row(defs), typeWith(TEXT, jsonArray)),
      ),
    ).toEqual({ Value: wire });
  });

  it("reads the string back into the array model", () => {
    const e = Materialize.item(
      { ID: 1, Value: wire },
      typeWith(NOTE, jsonArray),
    );
    expect(e.Value).toEqual(defs);
  });

  it("hands a single-valued column's array to fromProvider whole", () => {
    const seen: unknown[] = [];
    const et = typeWith(TEXT, {
      fromProvider: (v) => {
        seen.push(v);
        return v;
      },
    });
    Materialize.item({ ID: 1, Value: ["a", "b"] }, et);
    expect(seen).toEqual([["a", "b"]]);
  });
});

describe("a codec on a multi-valued column runs per element", () => {
  const upper: IValueCodec = {
    toProvider: (v) => String(v).toUpperCase(),
    fromProvider: (v) => String(v).toLowerCase(),
  };

  it("multi-Choice: per element on write and on read", () => {
    const et = typeWith(MULTI_CHOICE, upper);
    expect(byColumn(PayloadBuilder.buildForAdd(row(["a", "b"]), et))).toEqual({
      Value: ["A", "B"],
    });
    expect(Materialize.item({ ID: 1, Value: ["A", "B"] }, et).Value).toEqual([
      "a",
      "b",
    ]);
  });

  it("multi-Lookup: per element on write and on read", () => {
    const et = typeWith(MULTI_LOOKUP, {
      toProvider: (v) => (v as { Id: number }).Id,
      fromProvider: (id) => ({ Id: id }),
    });
    expect(
      byColumn(PayloadBuilder.buildForAdd(row([{ Id: 1 }, { Id: 2 }]), et)),
    ).toEqual({ Value: [1, 2] });
    expect(Materialize.item({ ID: 1, Value: [1, 2] }, et).Value).toEqual([
      { Id: 1 },
      { Id: 2 },
    ]);
  });

  it("a multi column whose model is not an array gets the codec once", () => {
    const et = typeWith(MULTI_CHOICE, {
      toProvider: (s) => String(s).split(","),
    });
    expect(byColumn(PayloadBuilder.buildForAdd(row("a,b"), et))).toEqual({
      Value: ["a", "b"],
    });
  });
});

@JsonShape()
class Template {
  @NoteField({ codec: jsonArray }) FieldDefinitions?: Def[];
  @TextField() Name?: string;
}

@Entity({ list: "Templates" })
class TemplateRow {
  Id?: number;
  @JsonField({ of: () => Template }) Body?: Template;
}

function bodyCodec(): IValueCodec {
  const mb = new ModelBuilder();
  mb.entity(TemplateRow as never);
  return mb
    .build()
    .findEntityType(TemplateRow as never)!
    .findProperty("Body")!.codec!;
}

describe("inside a Json shape", () => {
  it("an array-model codec on a Note property writes one string and reads it back", () => {
    const t = new Template();
    t.Name = "T";
    t.FieldDefinitions = [{ propertyName: "username" }];
    const wire = bodyCodec().toProvider!(t) as string;
    expect(JSON.parse(wire)).toEqual({
      Name: "T",
      FieldDefinitions: '[{"propertyName":"username"}]',
    });
    const back = bodyCodec().fromProvider!(wire) as Template;
    expect(back.FieldDefinitions).toEqual([{ propertyName: "username" }]);
  });
});
```

- [ ] **Step 2: Run to verify the right ones fail**

Run: `npx vitest run test/unit/Save/codecPerElement.test.ts` in `packages/speel-core`
Expected: FAIL — the Note/Text add/update cases get `['{"propertyName":"username"}']`, "hands … whole" sees `["a","b"]` as two calls, the shape case writes an array. The multi-Choice/multi-Lookup/read cases pass already (regression guards).

- [ ] **Step 3: Implement the predicate**

```ts
// packages/speel-core/src/Metadata/columnValue.ts
import type { FieldConfig } from "./FieldConfig.js";

/**
 * Whether a column holds several values, each its own wire value: a multi Lookup or a
 * multi Choice. Decided from config alone, never from the value's runtime shape — a
 * single-valued column whose model happens to be an array (a Note holding a JSON-encoded
 * list) is one value, and so is a MultiJson column (one JSON string holding every element).
 */
export function isMultiValued(config: FieldConfig): boolean {
  return (config.kind === "Lookup" || config.kind === "Choice") && config.multi;
}

/**
 * Runs `fn` the way a codec runs on this column: per element for a multi-valued column
 * holding an array, otherwise once on the whole value.
 */
export function mapColumnValue(
  config: FieldConfig,
  value: unknown,
  fn: (v: unknown) => unknown,
): unknown {
  return isMultiValued(config) && Array.isArray(value)
    ? value.map((x) => fn(x))
    : fn(value);
}
```

- [ ] **Step 4: Apply it at the four sites**

`PayloadBuilder.ts` — replace the doc's last paragraph and the function body:

```ts
import { mapColumnValue } from "../Metadata/columnValue.js";

/**
 * …(keep the first paragraph as is)…
 *
 * Per element only for a multi-VALUED column (multi-Lookup, multi-Choice), decided from
 * the column's config (`mapColumnValue`): each array element is its own wire value. Every
 * other column's codec gets the whole value — a Json field's codec (for a MultiJsonField
 * the array IS the value, one JSON string holding every element), and a single-valued
 * column whose model is an array (a Note holding a JSON-encoded list).
 */
function toProviderValue(prop: Property, model: unknown): unknown {
  const toProvider = prop.codec?.toProvider;
  if (model === undefined || model === null || !toProvider) return model;
  return mapColumnValue(prop.config, model, toProvider);
}
```

`Materialize.ts` — import `mapColumnValue` from `../Metadata/columnValue.js`, change the doc's "per element for arrays" to "per element for a multi-valued column", and:

```ts
if (conv) v = mapColumnValue(p.config, v, conv);
```

`shapeCodec.ts` — import `mapColumnValue` from `../../Metadata/columnValue.js`; in `toInstance`:

```ts
// Per element for a multi-valued property — exactly what Materialize.item does with
// a column's own value, so a multi-Choice property with a codec reads the same inside
// a shape as it does in a column of its own.
const fromProvider = p.codec?.fromProvider;
const value = fromProvider
  ? mapColumnValue(p.config, decoded, fromProvider)
  : decoded;
```

and in `toPlain`:

```ts
// Per element for a multi-valued property — the mirror of the read above, and of
// PayloadBuilder.toProviderValue.
const toProvider = p.codec?.toProvider;
const converted = toProvider
  ? mapColumnValue(p.config, model, toProvider)
  : model;
```

- [ ] **Step 5: Run the new file and the whole core suite**

Run: `npx vitest run test/unit/Save/codecPerElement.test.ts` then `npm test` in `packages/speel-core`
Expected: PASS, no regressions (the existing per-element tests use a multi-Choice `Tags`).

- [ ] **Step 6: Commit**

```bash
git add packages/speel-core/src/Metadata/columnValue.ts packages/speel-core/src/Save/PayloadBuilder.ts packages/speel-core/src/Query/Materialize.ts packages/speel-core/src/ModelBuilder/fieldTypes/shapeCodec.ts packages/speel-core/test/unit/Save/codecPerElement.test.ts
git commit -m "fix(core): run a codec per element only on multi-valued columns (#69)"
```

---

### Task 2: React — the focus-return helper

**Files:**

- Create: `packages/speel-react/src/surface/focusReturn.ts`
- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (add `ReturnFocusTarget` beside `DialogProps`)
- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx:478-480` (import `FOCUSABLE` instead of declaring it)
- Modify: `packages/speel-react/src/index.ts` (skin-support exports)
- Create: `packages/speel-react/test/focusSpy.ts`
- Test: `packages/speel-react/test/focusReturn.test.tsx`

**Interfaces:**

- Produces:
  - `type ReturnFocusTarget = HTMLElement | (() => HTMLElement | null | undefined) | false` (adapter file, exported)
  - `FOCUSABLE: string`, `tabbablesIn(root: Element): HTMLElement[]`
  - `returnFocusTo(target: HTMLElement | null | undefined, focusWasInside: boolean): void`
  - `useFocusReturn(o: { open: boolean; returnFocus?: ReturnFocusTarget | undefined }): { restore(focusWasInside: boolean): void }`
  - test helper `spyFocus(): { calls: { el: HTMLElement; opts: FocusOptions | undefined }[]; restore(): void }`

- [ ] **Step 1: Add the type to the contract**

In `SpeelUIAdapter.ts`, above `export interface DialogProps`:

```ts
/**
 * Where focus goes when a surface closes. Unset: back to what had focus when it opened.
 * An element, or a function called at close: there instead (falling back to the opener
 * when it resolves to nothing). `false`: speel leaves focus alone. Never scrolls the page.
 */
export type ReturnFocusTarget =
  HTMLElement | (() => HTMLElement | null | undefined) | false;
```

- [ ] **Step 2: Write the focus spy and the failing tests**

```ts
// packages/speel-react/test/focusSpy.ts
import { vi } from "vitest";

export interface FocusCall {
  el: HTMLElement;
  opts: FocusOptions | undefined;
}

/** Records every `HTMLElement.focus` call (element + options) and still moves focus. */
export function spyFocus(): { calls: FocusCall[]; restore(): void } {
  const calls: FocusCall[] = [];
  const original = HTMLElement.prototype.focus;
  const spy = vi
    .spyOn(HTMLElement.prototype, "focus")
    .mockImplementation(function (this: HTMLElement, opts?: FocusOptions) {
      calls.push({ el: this, opts });
      original.call(this, opts);
    });
  return { calls, restore: () => spy.mockRestore() };
}
```

```tsx
// packages/speel-react/test/focusReturn.test.tsx
import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import {
  returnFocusTo,
  tabbablesIn,
  useFocusReturn,
} from "../src/surface/focusReturn.js";
import type { ReturnFocusTarget } from "../src/adapter/SpeelUIAdapter.js";
import { spyFocus } from "./focusSpy.js";

const button = (name: string): HTMLButtonElement => {
  const b = document.createElement("button");
  b.textContent = name;
  document.body.appendChild(b);
  return b;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("returnFocusTo", () => {
  it("focuses the target without scrolling when focus is nowhere", () => {
    const target = button("t");
    const spy = spyFocus();
    returnFocusTo(target, false);
    expect(spy.calls).toEqual([{ el: target, opts: { preventScroll: true } }]);
    expect(document.activeElement).toBe(target);
    spy.restore();
  });

  it("skips body, a detached element and a missing one", () => {
    const gone = document.createElement("button");
    const spy = spyFocus();
    returnFocusTo(document.body, true);
    returnFocusTo(gone, true);
    returnFocusTo(null, true);
    expect(spy.calls).toEqual([]);
    spy.restore();
  });

  it("leaves focus where the user put it unless it was inside the surface", () => {
    const target = button("t");
    const elsewhere = button("elsewhere");
    elsewhere.focus();
    const spy = spyFocus();
    returnFocusTo(target, false);
    expect(document.activeElement).toBe(elsewhere);
    returnFocusTo(target, true);
    expect(document.activeElement).toBe(target);
    spy.restore();
  });
});

describe("tabbablesIn", () => {
  it("lists enabled, tabbable controls in order", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<button>a</button><button disabled>b</button><span tabindex="-1">c</span><a href="#">d</a><input type="hidden">';
    document.body.appendChild(root);
    expect(tabbablesIn(root).map((e) => e.textContent)).toEqual(["a", "d"]);
  });
});

function Probe(p: {
  open: boolean;
  returnFocus?: ReturnFocusTarget;
  expose: (restore: (inside: boolean) => void) => void;
}): null {
  const { restore } = useFocusReturn({
    open: p.open,
    returnFocus: p.returnFocus,
  });
  p.expose(restore);
  return null;
}

/** Opens with `opener` focused, then moves focus to body as a closing surface would. */
function openAndClose(returnFocus?: ReturnFocusTarget): {
  restore: (inside: boolean) => void;
  opener: HTMLButtonElement;
} {
  const opener = button("opener");
  opener.focus();
  let restore: (inside: boolean) => void = () => {};
  const expose = (r: (inside: boolean) => void): void => {
    restore = r;
  };
  const props = returnFocus !== undefined ? { returnFocus } : {};
  const { rerender } = render(
    <Probe open={false} expose={expose} {...props} />,
  );
  rerender(<Probe open expose={expose} {...props} />);
  rerender(<Probe open={false} expose={expose} {...props} />);
  opener.blur();
  return { restore, opener };
}

describe("useFocusReturn", () => {
  it("returns focus to the opener captured when it opened", () => {
    const { restore, opener } = openAndClose();
    const spy = spyFocus();
    restore(true);
    expect(spy.calls).toEqual([{ el: opener, opts: { preventScroll: true } }]);
    spy.restore();
  });

  it("returnFocus as an element goes there instead", () => {
    const named = button("named");
    const { restore } = openAndClose(named);
    restore(true);
    expect(document.activeElement).toBe(named);
  });

  it("returnFocus as a function is called at close, and falls back to the opener on null", () => {
    let calls = 0;
    const { restore, opener } = openAndClose(() => {
      calls++;
      return null;
    });
    expect(calls).toBe(0);
    restore(true);
    expect(calls).toBe(1);
    expect(document.activeElement).toBe(opener);
  });

  it("returnFocus false moves nothing", () => {
    const { restore } = openAndClose(false);
    const spy = spyFocus();
    restore(true);
    expect(spy.calls).toEqual([]);
    spy.restore();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/focusReturn.test.tsx` in `packages/speel-react`
Expected: FAIL — module `../src/surface/focusReturn.js` not found.

- [ ] **Step 4: Implement**

```ts
// packages/speel-react/src/surface/focusReturn.ts
import { useCallback, useLayoutEffect, useRef } from "react";
import type { ReturnFocusTarget } from "../adapter/SpeelUIAdapter.js";

/** What can take focus: enabled, reachable controls. */
export const FOCUSABLE =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** The elements inside `root` that Tab reaches, in document order. */
export function tabbablesIn(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0,
  );
}

/**
 * Focuses `target` without scrolling the page. A target that is gone (`body`, detached,
 * missing) is skipped, and focus the user moved elsewhere is left alone: the move happens
 * only when focus was inside the closing surface (`focusWasInside`) or is nowhere (`body`).
 */
export function returnFocusTo(
  target: HTMLElement | null | undefined,
  focusWasInside: boolean,
): void {
  if (!target || target === document.body || !target.isConnected) return;
  const active = document.activeElement;
  if (!focusWasInside && active !== null && active !== document.body) return;
  target.focus({ preventScroll: true });
}

export interface FocusReturnOptions {
  open: boolean;
  returnFocus?: ReturnFocusTarget | undefined;
}

/**
 * A surface's focus return, shared by the skins. It remembers what had focus in the
 * commit where `open` turns true — before the surface moves focus inside — and `restore`
 * sends focus back per `returnFocus`, never scrolling. The skin calls `restore` from its
 * own close-focus hook (Fluent's `onRestoreFocus`, Radix's `onCloseAutoFocus`) after
 * turning that hook's own restore off; a plain `.focus()` there scrolls the page to an
 * opener that is a tall container.
 */
export function useFocusReturn({ open, returnFocus }: FocusReturnOptions): {
  restore(focusWasInside: boolean): void;
} {
  const opener = useRef<HTMLElement | null>(null);
  const latest = useRef(returnFocus);
  latest.current = returnFocus;
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
  }, [open]);
  const restore = useCallback((focusWasInside: boolean) => {
    const rf = latest.current;
    const fallback = opener.current;
    opener.current = null;
    if (rf === false) return;
    const named = typeof rf === "function" ? rf() : rf;
    returnFocusTo(named ?? fallback, focusWasInside);
  }, []);
  return { restore };
}
```

In `primitives.tsx` delete the local `FOCUSABLE` declaration (and its doc line) and add `import { FOCUSABLE } from "../surface/focusReturn.js";`.

In `index.ts`, under "Skin-support hooks", add:

```ts
export {
  useFocusReturn,
  returnFocusTo,
  tabbablesIn,
  FOCUSABLE,
} from "./surface/focusReturn.js";
export type { FocusReturnOptions } from "./surface/focusReturn.js";
```

and export the type `ReturnFocusTarget` wherever the adapter types are re-exported (`grep -n "DialogProps" packages/speel-react/src/index.ts` — add it to that list).

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/focusReturn.test.tsx && npm run typecheck` in `packages/speel-react`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/speel-react/src/surface/focusReturn.ts packages/speel-react/src/adapter/SpeelUIAdapter.ts packages/speel-react/src/fluent-v8/primitives.tsx packages/speel-react/src/index.ts packages/speel-react/test/focusSpy.ts packages/speel-react/test/focusReturn.test.tsx
git commit -m "feat(react): useFocusReturn — restore focus without scrolling, shared by the skins (#71)"
```

---

### Task 3: React — `returnFocus` on the contract and through every surface

**Files:**

- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`DialogProps`)
- Modify: `packages/speel-react/src/surface/surfaceProps.ts` (`SurfaceChromeProps`)
- Modify: `packages/speel-react/src/surface/SpeelPanel.tsx`, `SpeelModal.tsx`, `SurfaceForm.tsx`, `SurfaceManager.tsx`
- Test: `packages/speel-react/test/surfaceReturnFocus.test.tsx`

**Interfaces:**

- Consumes: `ReturnFocusTarget` (Task 2).
- Produces: `DialogProps.returnFocus?: ReturnFocusTarget`, `SurfaceChromeProps.returnFocus?: ReturnFocusTarget` (so `FormRequest` carries it too).

- [ ] **Step 1: Write the failing test**

```tsx
// packages/speel-react/test/surfaceReturnFocus.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelModal } from "../src/surface/SpeelModal.js";
import { SpeelPanel } from "../src/surface/SpeelPanel.js";
import { SurfaceManager } from "../src/surface/SurfaceManager.js";
import { useSurfaces } from "../src/surface/useSurfaces.js";
import type {
  DialogProps,
  DrawerProps,
  SpeelUIAdapter,
} from "../src/adapter/SpeelUIAdapter.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
    });
  }
}

const seen: { dialog: DialogProps[]; drawer: DrawerProps[] } = {
  dialog: [],
  drawer: [],
};
const FakeDialog = fakeAdapter.Dialog;
const FakeDrawer = fakeAdapter.Drawer;
const recording: SpeelUIAdapter = {
  ...fakeAdapter,
  Dialog: (p) => {
    seen.dialog.push(p);
    return <FakeDialog {...p} />;
  },
  Drawer: (p) => {
    seen.drawer.push(p);
    return <FakeDrawer {...p} />;
  },
};

const wrap = (node: JSX.Element) =>
  render(
    <SpeelProvider
      db={
        new TCtx({
          provider: makeFakeProvider({ Tasks: [] }),
        } as never) as never
      }
      ui={recording}
    >
      <SurfaceManager>{node}</SurfaceManager>
    </SpeelProvider>,
  );

const target = document.createElement("button");
const entity = () => Object.assign(new Task(), { Id: 1, Title: "T" });

describe("returnFocus reaches the skin from every surface", () => {
  it("SpeelPanel, content variant", () => {
    wrap(
      <SpeelPanel open onOpenChange={() => {}} returnFocus={target}>
        x
      </SpeelPanel>,
    );
    expect(seen.drawer.at(-1)?.returnFocus).toBe(target);
  });

  it("SpeelModal, content variant", () => {
    wrap(
      <SpeelModal open onOpenChange={() => {}} returnFocus={false}>
        x
      </SpeelModal>,
    );
    expect(seen.dialog.at(-1)?.returnFocus).toBe(false);
  });

  it("SpeelPanel and SpeelModal, form variant", () => {
    wrap(
      <>
        <SpeelPanel
          open
          onOpenChange={() => {}}
          entity={entity()}
          returnFocus={target}
        />
        <SpeelModal
          open
          onOpenChange={() => {}}
          entity={entity()}
          returnFocus={target}
        />
      </>,
    );
    expect(seen.drawer.at(-1)?.returnFocus).toBe(target);
    expect(seen.dialog.at(-1)?.returnFocus).toBe(target);
  });

  it("showForm", () => {
    function Harness() {
      const { showForm } = useSurfaces();
      return (
        <button
          onClick={() =>
            void showForm({ entity: entity(), returnFocus: target } as never)
          }
        >
          open
        </button>
      );
    }
    wrap(<Harness />);
    fireEvent.click(screen.getByText("open"));
    expect(seen.drawer.at(-1)?.returnFocus).toBe(target);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/surfaceReturnFocus.test.tsx`
Expected: FAIL (tsc in the test run aside, vitest reports `returnFocus` undefined in `seen`).

- [ ] **Step 3: Implement**

`SpeelUIAdapter.ts` — in `DialogProps`, after `defaultFullscreen`:

```ts
  /** Where focus goes when the surface closes — see {@link ReturnFocusTarget}. */
  returnFocus?: ReturnFocusTarget;
```

`surfaceProps.ts` — import `type { ReturnFocusTarget } from "../adapter/SpeelUIAdapter.js"`; in `SurfaceChromeProps` after `resizable`:

```ts
  /**
   * Where focus goes when the surface closes. Unset: back to what had focus when it
   * opened. An element, or a function called at close: there instead. `false`: speel
   * leaves focus alone. Never scrolls the page.
   */
  returnFocus?: ReturnFocusTarget;
```

`SpeelPanel.tsx` and `SpeelModal.tsx` — add `returnFocus` to the destructuring of the content variant and to the element:

```tsx
      {...(returnFocus !== undefined ? { returnFocus } : {})}
```

`SurfaceForm.tsx` — on `<Surface …>` after the `defaultFullscreen` spread:

```tsx
      {...(p.returnFocus !== undefined ? { returnFocus: p.returnFocus } : {})}
```

`SurfaceManager.tsx` — in `common`, after the `defaultFullscreen` spread:

```ts
          ...(o.returnFocus !== undefined ? { returnFocus: o.returnFocus } : {}),
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run test/surfaceReturnFocus.test.tsx test/surfaceChrome.test.tsx test/SurfaceManager.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/speel-react/src/adapter/SpeelUIAdapter.ts packages/speel-react/src/surface packages/speel-react/test/surfaceReturnFocus.test.tsx
git commit -m "feat(react): returnFocus on DialogProps and every surface (#71)"
```

---

### Task 4: v8 skin — Panel and Modal restore focus without scrolling (#71)

**Files:**

- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (`V8Dialog` `<Modal>`, `V8Panel` `<Panel>`)
- Test: `packages/speel-react/test/v8SurfaceFocus.test.tsx`

**Interfaces:**

- Consumes: `useFocusReturn` (Task 2), `DialogProps.returnFocus` (Task 3).

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/speel-react/test/v8SurfaceFocus.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { V8Dialog, V8Panel } from "../src/fluent-v8/primitives.js";
import type {
  DrawerProps,
  ReturnFocusTarget,
} from "../src/adapter/SpeelUIAdapter.js";
import { spyFocus, type FocusCall } from "./focusSpy.js";

const surfaces: [string, ComponentType<DrawerProps>][] = [
  ["V8Panel", V8Panel],
  ["V8Dialog", V8Dialog as ComponentType<DrawerProps>],
];

const tick = async (): Promise<void> => {
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
};

describe.each(surfaces)("%s focus return", (_name, Surface) => {
  let opener: HTMLButtonElement;
  beforeEach(() => {
    vi.useFakeTimers();
    opener = document.createElement("button");
    opener.textContent = "opener";
    document.body.appendChild(opener);
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  /** Open from the focused opener, focus inside, close; the focus calls made by the close. */
  async function cycle(
    opts: { returnFocus?: ReturnFocusTarget; beforeClose?: () => void } = {},
  ): Promise<FocusCall[]> {
    opener.focus();
    const rf =
      opts.returnFocus !== undefined ? { returnFocus: opts.returnFocus } : {};
    const ui = (open: boolean) => (
      <Surface open={open} onOpenChange={() => {}} title="S" {...rf}>
        <button>inside</button>
      </Surface>
    );
    const { rerender } = render(ui(false));
    rerender(ui(true));
    await tick();
    screen.getByText("inside").focus();
    opts.beforeClose?.();
    const spy = spyFocus();
    rerender(ui(false));
    await tick();
    spy.restore();
    return spy.calls;
  }

  it("returns to the opener with preventScroll", async () => {
    const calls = await cycle();
    expect(calls).toEqual([{ el: opener, opts: { preventScroll: true } }]);
  });

  it("does not focus body when body had focus at open", async () => {
    opener.remove();
    document.body.focus();
    const calls = await cycle();
    expect(calls.filter((c) => c.el === document.body)).toEqual([]);
  });

  it("skips an opener removed before close", async () => {
    const calls = await cycle({ beforeClose: () => opener.remove() });
    expect(calls).toEqual([]);
  });

  it("goes to returnFocus when given", async () => {
    const named = document.createElement("button");
    document.body.appendChild(named);
    const calls = await cycle({ returnFocus: () => named });
    expect(calls).toEqual([{ el: named, opts: { preventScroll: true } }]);
  });

  it("moves nothing with returnFocus false — Fluent's own restore is off too", async () => {
    const calls = await cycle({ returnFocus: false });
    expect(calls).toEqual([]);
  });
});
```

Note: `cycle()` in "does not focus body" calls `opener.focus()` on a removed node — harmless (focus stays on body).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/v8SurfaceFocus.test.tsx`
Expected: FAIL — Fluent restores with `focus()` (opts `undefined`), and `returnFocus` cases are ignored.

- [ ] **Step 3: Implement**

In `V8Dialog`, before `return`:

```tsx
const { restore } = useFocusReturn({
  open: p.open,
  returnFocus: p.returnFocus,
});
```

and on `<Modal>`:

```tsx
      // Focus return is speel's (useFocusReturn): Fluent's own two restores — the trap
      // zone's and the popup's — use a plain focus(), which scrolls the page to an
      // opener that is a tall container. The popup hook still tells us when to run.
      focusTrapZoneProps={{ disableRestoreFocus: true }}
      popupProps={{ onRestoreFocus: ({ containsFocus }) => restore(containsFocus) }}
```

Same two lines (with the same comment) on `<Panel>` in `V8Panel`, with its own `useFocusReturn` call. Import `useFocusReturn` from `../surface/focusReturn.js` (merge with the `FOCUSABLE` import).

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/v8SurfaceFocus.test.tsx test/fluentV8.smoke.test.tsx`
Expected: PASS (smoke still covers V8Dialog's own focus-into-the-body effect).

- [ ] **Step 5: Commit**

```bash
git add packages/speel-react/src/fluent-v8/primitives.tsx packages/speel-react/test/v8SurfaceFocus.test.tsx
git commit -m "fix(react): v8 Panel/Modal return focus without scrolling the page (#71)"
```

---

### Task 5: React — popover contract, button aria fields, `usePopoverFocus`

**Files:**

- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`PopoverTriggerProps`, `PopoverProps`, `ButtonProps`, `IconButtonProps`)
- Create: `packages/speel-react/src/surface/popoverFocus.ts`
- Modify: `packages/speel-react/src/index.ts`
- Modify: `packages/speel-react/test/fakeAdapter.tsx` (`FakePopover`, `Popover`, `Button`, `IconButton`)
- Test: `packages/speel-react/test/popoverFocus.test.tsx`

**Interfaces:**

- Consumes: `FOCUSABLE`, `tabbablesIn`, `returnFocusTo` (Task 2).
- Produces:
  - `interface PopoverTriggerProps { ariaExpanded: boolean; ariaHasPopup: "dialog"; ariaControls: string | undefined }`
  - `PopoverProps.trigger: ReactNode | ((t: PopoverTriggerProps) => ReactNode)`, `PopoverProps.label?: string`
  - `ButtonProps` / `IconButtonProps`: `ariaExpanded?: boolean; ariaHasPopup?: AriaAttributes["aria-haspopup"]; ariaControls?: string | undefined`
  - `usePopoverFocus(p: Pick<PopoverProps, "open" | "onOpenChange">): PopoverFocus` with `{ anchorRef: RefObject<HTMLSpanElement>; contentId: string; renderTrigger(t: PopoverProps["trigger"]): ReactNode; onContentKeyDown(e: KeyboardEvent<HTMLElement>): void; restore(focusWasInside: boolean): void }`

- [ ] **Step 1: Contract**

In `SpeelUIAdapter.ts` add `AriaAttributes` to the `react` type import. Add to `ButtonProps` (after `ariaLabel`) and to `IconButtonProps` (after `toggled`):

```ts
  /** Whether the popup this button opens is showing (`aria-expanded`). */
  ariaExpanded?: boolean;
  /** What this button opens (`aria-haspopup`): `"dialog"` for a popover, `"menu"` for a menu. */
  ariaHasPopup?: AriaAttributes["aria-haspopup"];
  /** The id of what this button opens (`aria-controls`); undefined while it is not on the page. */
  ariaControls?: string | undefined;
```

Replace `PopoverProps`:

```ts
/** What a popover hands a trigger function: spread it onto `ui.Button` / `ui.IconButton`. */
export interface PopoverTriggerProps {
  ariaExpanded: boolean;
  ariaHasPopup: "dialog";
  /** The popup's id while it is open; undefined while closed. */
  ariaControls: string | undefined;
}

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * What opens the popover, rendered in place: a node, or a function handed the trigger's
   * aria wiring to spread onto a `ui.Button`/`ui.IconButton`. The trigger toggles `open`
   * itself; focus returns to it when the popover closes.
   */
  trigger: ReactNode | ((t: PopoverTriggerProps) => ReactNode);
  /** The popup's accessible name (it is a `dialog`). */
  label?: string;
  children: ReactNode;
}
```

- [ ] **Step 2: Write the failing test (through `fakeAdapter`, which uses the hook)**

```tsx
// packages/speel-react/test/popoverFocus.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import type { PopoverTriggerProps } from "../src/adapter/SpeelUIAdapter.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { spyFocus } from "./focusSpy.js";

const Popover = fakeAdapter.Popover;
const Button = fakeAdapter.Button;

afterEach(() => {
  document.body.innerHTML = "";
});

function Harness(p: {
  children?: ReactNode;
  seen?: PopoverTriggerProps[];
  onOpenChange?: (o: boolean) => void;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(p.initiallyOpen ?? false);
  return (
    <Popover
      label="Contact"
      open={open}
      onOpenChange={(o) => {
        p.onOpenChange?.(o);
        setOpen(o);
      }}
      trigger={(t) => {
        p.seen?.push(t);
        return <Button text="Org" {...t} onClick={() => setOpen((o) => !o)} />;
      }}
    >
      {p.children ?? (
        <>
          <button>first</button>
          <button>last</button>
        </>
      )}
    </Popover>
  );
}

describe("usePopoverFocus (via fakeAdapter.Popover)", () => {
  it("wires the trigger closed and open", () => {
    const seen: PopoverTriggerProps[] = [];
    render(<Harness seen={seen} />);
    expect(seen.at(-1)).toEqual({
      ariaExpanded: false,
      ariaHasPopup: "dialog",
      ariaControls: undefined,
    });
    const org = screen.getByRole("button", { name: "Org" });
    expect(org).toHaveAttribute("aria-expanded", "false");
    expect(org).toHaveAttribute("aria-haspopup", "dialog");
    expect(org).not.toHaveAttribute("aria-controls");
    fireEvent.click(org);
    const dialog = screen.getByRole("dialog", { name: "Contact" });
    expect(seen.at(-1)?.ariaExpanded).toBe(true);
    expect(org).toHaveAttribute("aria-controls", dialog.id);
  });

  it("Tab from the last element closes and focuses the trigger", () => {
    const onOpenChange = vi.fn();
    render(<Harness initiallyOpen onOpenChange={onOpenChange} />);
    const last = screen.getByText("last");
    last.focus();
    const spy = spyFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    spy.restore();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const org = screen.getByRole("button", { name: "Org" });
    expect(spy.calls).toEqual([{ el: org, opts: { preventScroll: true } }]);
  });

  it("Shift+Tab from the first element closes too", () => {
    const onOpenChange = vi.fn();
    render(<Harness initiallyOpen onOpenChange={onOpenChange} />);
    const first = screen.getByText("first");
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Org" }),
    );
  });

  it("Tab between inner elements leaves it open", () => {
    const onOpenChange = vi.fn();
    render(<Harness initiallyOpen onOpenChange={onOpenChange} />);
    const first = screen.getByText("first");
    first.focus();
    fireEvent.keyDown(first, { key: "Tab" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("Tab with nothing focusable inside closes and returns to the trigger", () => {
    const onOpenChange = vi.fn();
    render(
      <Harness initiallyOpen onOpenChange={onOpenChange}>
        <span>only text</span>
      </Harness>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Org" }),
    );
  });

  it("a plain node trigger still renders", () => {
    render(
      <Popover open onOpenChange={() => {}} trigger={<button>plain</button>}>
        body
      </Popover>,
    );
    expect(screen.getByText("plain")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("body");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/popoverFocus.test.tsx`
Expected: FAIL — the fake renders a function trigger as a child (React warning, no button), no label, no Tab handling.

- [ ] **Step 4: Implement the hook**

```ts
// packages/speel-react/src/surface/popoverFocus.ts
import { useRef } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import type {
  PopoverProps,
  PopoverTriggerProps,
} from "../adapter/SpeelUIAdapter.js";
import { useStableId } from "../fluent-v8/useStableId.js";
import { FOCUSABLE, returnFocusTo, tabbablesIn } from "./focusReturn.js";

export interface PopoverFocus {
  /** On the element wrapping the trigger: the popover anchors to it and focus returns into it. */
  anchorRef: RefObject<HTMLSpanElement>;
  /** The id for the content element (the `role="dialog"`) — the trigger's `aria-controls`. */
  contentId: string;
  /** The trigger, rendered: a node as-is, a function with its aria wiring. */
  renderTrigger(trigger: PopoverProps["trigger"]): ReactNode;
  /** On the content element: Tab past either end closes and returns to the trigger. */
  onContentKeyDown(e: KeyboardEvent<HTMLElement>): void;
  /** From the skin's close-focus hook, with that hook's own restore turned off. */
  restore(focusWasInside: boolean): void;
}

/**
 * A popover's keyboard and focus behaviour, shared by the skins. The content is laid out
 * at the end of the page, so Tab would walk out of it to the end of the document: Tab past
 * the last element (or Shift+Tab before the first) closes it instead. Every close returns
 * focus to the trigger itself — the first focusable element in the trigger wrapper —
 * rather than to whatever had focus at open, which differs by browser (Safari does not
 * focus a clicked button).
 */
export function usePopoverFocus({
  open,
  onOpenChange,
}: Pick<PopoverProps, "open" | "onOpenChange">): PopoverFocus {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const contentId = useStableId();
  const trigger = (): HTMLElement | null =>
    anchorRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
  const triggerProps: PopoverTriggerProps = {
    ariaExpanded: open,
    ariaHasPopup: "dialog",
    ariaControls: open ? contentId : undefined,
  };
  return {
    anchorRef,
    contentId,
    renderTrigger: (t) => (typeof t === "function" ? t(triggerProps) : t),
    onContentKeyDown: (e) => {
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
      const items = tabbablesIn(e.currentTarget);
      const active = document.activeElement;
      const atEdge =
        items.length === 0 ||
        (e.shiftKey
          ? active === items[0] || active === e.currentTarget
          : active === items[items.length - 1]);
      if (!atEdge) return;
      e.preventDefault();
      onOpenChange(false);
      returnFocusTo(trigger(), true);
    },
    restore: (focusWasInside) => returnFocusTo(trigger(), focusWasInside),
  };
}
```

`index.ts` (skin-support block):

```ts
export { usePopoverFocus } from "./surface/popoverFocus.js";
export type { PopoverFocus } from "./surface/popoverFocus.js";
```

and add `PopoverTriggerProps` to the adapter type re-exports.

- [ ] **Step 5: Update `fakeAdapter.tsx`**

Import `usePopoverFocus` from `../src/surface/popoverFocus.js` and `PopoverProps` type. Replace `FakePopover`:

```tsx
const FakePopover = ({
  open,
  onOpenChange,
  trigger,
  label,
  children,
}: PopoverProps): JSX.Element => {
  const f = usePopoverFocus({ open, onOpenChange });
  return (
    <span ref={f.anchorRef}>
      {f.renderTrigger(trigger)}
      {open ? (
        <div
          role="dialog"
          id={f.contentId}
          aria-label={label}
          onKeyDown={f.onContentKeyDown}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
};
```

`Popover: (p) => <FakePopover {...p} />`. In `Button` add `ariaExpanded, ariaHasPopup, ariaControls` to the destructuring and on the `<button>`:

```tsx
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-controls={ariaControls}
```

Same three on `IconButton`.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run test/popoverFocus.test.tsx test/SpeelTable.chooser.test.tsx test/SpeelTable.filters.test.tsx && npm run typecheck && npm run test:types`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/speel-react/src/adapter/SpeelUIAdapter.ts packages/speel-react/src/surface/popoverFocus.ts packages/speel-react/src/index.ts packages/speel-react/test/fakeAdapter.tsx packages/speel-react/test/popoverFocus.test.tsx
git commit -m "feat(react): popover label, trigger function and button aria fields; usePopoverFocus (#72)"
```

---

### Task 6: v8 skin — Popover and buttons (#72)

**Files:**

- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (`V8Popover`, `V8FluentButton`, `V8IconButton`)
- Test: `packages/speel-react/test/v8Popover.test.tsx`

**Interfaces:**

- Consumes: `usePopoverFocus` (Task 5), button aria fields (Task 5).

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/speel-react/test/v8Popover.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import {
  V8Button,
  V8IconButton,
  V8Popover,
} from "../src/fluent-v8/primitives.js";
import { spyFocus } from "./focusSpy.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function Harness({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <V8Popover
      label="Contact"
      open={open}
      onOpenChange={(o) => {
        onOpenChange?.(o);
        setOpen(o);
      }}
      trigger={(t) => (
        <V8Button text="Org" {...t} onClick={() => setOpen((o) => !o)} />
      )}
    >
      <a href="mailto:x@example.com">mail</a>
    </V8Popover>
  );
}

describe("V8Popover", () => {
  it("is a labelled dialog its trigger points at", () => {
    render(<Harness />);
    const org = screen.getByRole("button", { name: "Org" });
    expect(org).toHaveAttribute("aria-expanded", "false");
    expect(org).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(org);
    const dialog = screen.getByRole("dialog", { name: "Contact" });
    expect(org).toHaveAttribute("aria-expanded", "true");
    expect(org).toHaveAttribute("aria-controls", dialog.id);
  });

  it("Tab past the last element closes and focuses the trigger", () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Org" }));
    const mail = screen.getByText("mail");
    mail.focus();
    const spy = spyFocus();
    fireEvent.keyDown(mail, { key: "Tab" });
    spy.restore();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(spy.calls[0]).toEqual({
      el: screen.getByRole("button", { name: "Org" }),
      opts: { preventScroll: true },
    });
  });

  it("Esc closes and focuses the trigger", async () => {
    render(<Harness />);
    const org = screen.getByRole("button", { name: "Org" });
    fireEvent.click(org);
    const mail = screen.getByText("mail");
    mail.focus();
    fireEvent.keyDown(mail, { key: "Escape", which: 27, keyCode: 27 });
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(org);
  });
});

describe("v8 buttons carry the aria fields", () => {
  it("Button and IconButton", () => {
    render(
      <>
        <V8Button
          text="Views"
          ariaExpanded={false}
          ariaHasPopup="menu"
          ariaControls="m1"
        />
        <V8IconButton
          iconName="Filter"
          title="Filter"
          ariaExpanded
          ariaHasPopup="dialog"
          ariaControls="p1"
        />
      </>,
    );
    const views = screen.getByRole("button", { name: "Views" });
    expect(views).toHaveAttribute("aria-expanded", "false");
    expect(views).toHaveAttribute("aria-haspopup", "menu");
    expect(views).toHaveAttribute("aria-controls", "m1");
    const filter = screen.getByRole("button", { name: "Filter" });
    expect(filter).toHaveAttribute("aria-expanded", "true");
    expect(filter).toHaveAttribute("aria-haspopup", "dialog");
    expect(filter).toHaveAttribute("aria-controls", "p1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/v8Popover.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
export function V8Popover(p: PopoverProps): JSX.Element {
  const f = usePopoverFocus(p);
  return (
    <span ref={f.anchorRef} style={{ display: "inline-flex" }}>
      {f.renderTrigger(p.trigger)}
      {p.open ? (
        <Callout
          target={f.anchorRef}
          onDismiss={() => p.onOpenChange(false)}
          isBeakVisible={false}
          setInitialFocus
          // Focus goes back to the trigger itself (usePopoverFocus), not to whatever
          // Fluent saw focused at open — a body on Safari, which does not focus a click.
          onRestoreFocus={({ containsFocus }) => f.restore(containsFocus)}
        >
          <div
            role="dialog"
            id={f.contentId}
            {...(p.label !== undefined ? { "aria-label": p.label } : {})}
            onKeyDown={f.onContentKeyDown}
            style={{ padding: 12, minWidth: 240 }}
          >
            {p.children}
          </div>
        </Callout>
      ) : null}
    </span>
  );
}
```

Import `usePopoverFocus` from `../surface/popoverFocus.js`. In `V8FluentButton` after the `ariaLabel` spread:

```tsx
      {...(p.ariaExpanded !== undefined ? { "aria-expanded": p.ariaExpanded } : {})}
      {...(p.ariaHasPopup !== undefined ? { "aria-haspopup": p.ariaHasPopup } : {})}
      {...(p.ariaControls !== undefined ? { "aria-controls": p.ariaControls } : {})}
```

Same three spreads on `<IconButton>` in `V8IconButton`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/v8Popover.test.tsx test/fluentV8.smoke.test.tsx test/v8TableHeader.test.tsx`
Expected: PASS. If Esc does not dismiss the Callout in jsdom, fire `keyDown` on `document.activeElement`'s Callout root instead and keep the assertion on focus.

- [ ] **Step 5: Commit**

```bash
git add packages/speel-react/src/fluent-v8/primitives.tsx packages/speel-react/test/v8Popover.test.tsx
git commit -m "fix(react): v8 Popover is a labelled dialog with Tab-out and trigger focus return (#72)"
```

---

### Task 7: Adopt in `ColumnChooser` and `ViewPicker`

**Files:**

- Modify: `packages/speel-react/src/table/ColumnChooser.tsx:30-45`
- Modify: `packages/speel-react/src/table/views/ViewPicker.tsx:228-241`
- Test: `packages/speel-react/test/SpeelTable.chooser.test.tsx`, `packages/speel-react/test/ViewPicker.test.tsx`

- [ ] **Step 1: Write the failing assertions**

Append to `SpeelTable.chooser.test.tsx` (reuse that file's render helper — read its top first):

```tsx
it("the chooser's trigger announces a labelled dialog", () => {
  // render the table exactly as the file's first test does
  const trigger = screen.getByRole("button", { name: "Choose columns" });
  expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  expect(
    screen.getByRole("dialog", { name: "Choose columns" }),
  ).toBeInTheDocument();
  expect(trigger).toHaveAttribute("aria-expanded", "true");
});
```

Append to `ViewPicker.test.tsx` (same: reuse its render helper):

```tsx
it("the view menu's trigger announces a menu", () => {
  // render the picker exactly as the file's first test does
  const trigger = screen.getAllByRole("button")[0]!;
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/SpeelTable.chooser.test.tsx test/ViewPicker.test.tsx`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement**

`ColumnChooser.tsx`:

```tsx
    <ui.Popover
      label="Choose columns"
      open={open}
      onOpenChange={setOpen}
      trigger={(t) => (
        <ui.IconButton
          {...t}
          iconName="ColumnOptions"
          title="Choose columns"
          toggled={open}
          onClick={() => setOpen((o) => !o)}
        />
      )}
    >
```

`ViewPicker.tsx` — on the menu trigger `ui.Button`:

```tsx
ariaHasPopup = "menu";
ariaExpanded = { open };
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/SpeelTable.chooser.test.tsx test/ViewPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/speel-react/src/table packages/speel-react/test/SpeelTable.chooser.test.tsx packages/speel-react/test/ViewPicker.test.tsx
git commit -m "feat(react): column chooser and view menu triggers announce their popups (#72)"
```

---

### Task 8: Label-less field primitives — contract, v8 skin, fake (#76)

**Files:**

- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`FieldChrome`, `TextInputProps`, `NumberInputProps`, `DropdownProps`, `CheckboxProps`, `IconButtonProps`)
- Modify: `packages/speel-react/src/fluent-v8/Field.tsx` (add `nameOf`)
- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (every field primitive + `V8IconButton`)
- Modify: `packages/speel-react/src/fluent-v8/richText.tsx`, `packages/speel-react/src/fluent-v8/RichTextEditor.tsx`
- Modify: `packages/speel-react/test/fakeAdapter.tsx` (field primitives + `IconButton`)
- Test: `packages/speel-react/test/v8FieldNames.test.tsx`

**Interfaces:**

- Produces: `FieldChrome.ariaLabel?: string`; `TextInputProps.placeholder?: string`, `TextInputProps.autoGrow?: boolean`; `NumberInputProps.placeholder?: string`; `IconButtonProps.ariaLabel?: string`; `nameOf(p: FieldChrome): string | undefined` (v8-internal).

- [ ] **Step 1: Contract**

`FieldChrome`:

```ts
export interface FieldChrome {
  label?: string;
  /**
   * The control's accessible name when no `label` is shown — an editor in a table cell, a
   * picker whose caption reads inline beside it (the footer's `Page [1] of 3`). With a
   * `label`, the label names the control and this is ignored.
   */
  ariaLabel?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  description?: string;
}
```

Delete `ariaLabel` (and its doc) from `DropdownProps` and `CheckboxProps` — they inherit it. `TextInputProps` gains:

```ts
  /** Shown while the input is empty. */
  placeholder?: string;
  /** Multiline only: the box grows with its content. Unset = the skin's default. */
  autoGrow?: boolean;
```

`NumberInputProps` gains `placeholder?: string;` (same doc). `IconButtonProps` gains:

```ts
  /** Accessible name when it should say more than the tooltip ("Edit item 7"); defaults to `title`. */
  ariaLabel?: string;
```

- [ ] **Step 2: Write the failing tests**

```tsx
// packages/speel-react/test/v8FieldNames.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  V8Checkbox,
  V8Combobox,
  V8DatePicker,
  V8Dropdown,
  V8FieldDisplay,
  V8FileInput,
  V8IconButton,
  V8NumberInput,
  V8PeoplePicker,
  V8RadioGroup,
  V8TextInput,
} from "../src/fluent-v8/primitives.js";

const opts = [{ key: "a", text: "Alpha", data: "a" }];
const none = vi.fn();
const NAME = "Comments for item 7";

describe("v8 field primitives are named by ariaLabel when they have no label", () => {
  it.each([
    ["TextInput", <V8TextInput ariaLabel={NAME} value="" onChange={none} />],
    [
      "TextInput multiline",
      <V8TextInput ariaLabel={NAME} multiline value="" onChange={none} />,
    ],
    [
      "NumberInput",
      <V8NumberInput ariaLabel={NAME} value={undefined} onChange={none} />,
    ],
    [
      "Checkbox",
      <V8Checkbox ariaLabel={NAME} checked={false} onChange={none} />,
    ],
    [
      "Dropdown",
      <V8Dropdown
        ariaLabel={NAME}
        value={undefined}
        options={opts}
        onChange={none}
      />,
    ],
    [
      "RadioGroup",
      <V8RadioGroup
        ariaLabel={NAME}
        value={undefined}
        options={opts}
        onChange={none}
      />,
    ],
    [
      "DatePicker",
      <V8DatePicker ariaLabel={NAME} value={undefined} onChange={none} />,
    ],
    [
      "PeoplePicker",
      <V8PeoplePicker
        ariaLabel={NAME}
        value={[]}
        onChange={none}
        onResolveSuggestions={async () => []}
      />,
    ],
    [
      "Combobox",
      <V8Combobox
        ariaLabel={NAME}
        value={[]}
        onChange={none}
        onResolveSuggestions={async () => []}
      />,
    ],
    [
      "FileInput",
      <V8FileInput ariaLabel={NAME} value={undefined} onChange={none} />,
    ],
    ["FieldDisplay", <V8FieldDisplay ariaLabel={NAME}>x</V8FieldDisplay>],
  ])("%s", (_name, ui) => {
    render(ui);
    expect(screen.getAllByLabelText(NAME).length).toBeGreaterThan(0);
  });

  it("a visible label wins over ariaLabel", () => {
    render(
      <V8TextInput label="Title" ariaLabel={NAME} value="" onChange={none} />,
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
  });
});

describe("placeholder and autoGrow", () => {
  it("TextInput and NumberInput show a placeholder", () => {
    render(
      <>
        <V8TextInput
          ariaLabel="t"
          placeholder="Add a comment"
          value=""
          onChange={none}
        />
        <V8NumberInput
          ariaLabel="n"
          placeholder="0.00"
          value={undefined}
          onChange={none}
        />
      </>,
    );
    expect(screen.getByPlaceholderText("Add a comment")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("0.00")).toBeInTheDocument();
  });

  it("autoGrow sizes a multiline box from its content (Fluent writes an inline height)", () => {
    render(
      <>
        <V8TextInput
          ariaLabel="grow"
          multiline
          autoGrow
          value="x"
          onChange={none}
        />
        <V8TextInput ariaLabel="fixed" multiline value="x" onChange={none} />
      </>,
    );
    expect(screen.getByLabelText("grow").style.height).not.toBe("");
    expect(screen.getByLabelText("fixed").style.height).toBe("");
  });
});

describe("V8IconButton ariaLabel", () => {
  it("names the button while the tooltip stays the title", () => {
    render(
      <V8IconButton iconName="Edit" title="Edit" ariaLabel="Edit item 7" />,
    );
    const b = screen.getByRole("button", { name: "Edit item 7" });
    expect(b).toHaveAttribute("title", "Edit");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/v8FieldNames.test.tsx`
Expected: FAIL for TextInput, NumberInput, RadioGroup, DatePicker, PeoplePicker, Combobox, FileInput, FieldDisplay, placeholders, autoGrow, IconButton (Checkbox and Dropdown already pass).

- [ ] **Step 4: Implement in the v8 skin**

`Field.tsx`:

```ts
/** The `ariaLabel` that names a control: only when no visible label does. */
export function nameOf(p: FieldChrome): string | undefined {
  return p.label === undefined ? p.ariaLabel : undefined;
}
```

In each primitive, `const name = nameOf(p);` then:

- `V8TextInput` `<TextField>`: `{...(name !== undefined ? { ariaLabel: name } : {})}`, `{...(p.placeholder !== undefined ? { placeholder: p.placeholder } : {})}`, `{...(p.multiline && p.autoGrow ? { autoAdjustHeight: true } : {})}`.
- `V8NumberInput` `<SpinButton>`: `{...(name !== undefined ? { ariaLabel: name } : {})}`, `{...(p.placeholder !== undefined ? { inputProps: { placeholder: p.placeholder } } : {})}`.
- `V8Checkbox`, `V8Dropdown` (both branches): replace `p.ariaLabel` with `name` in the existing spreads.
- `V8RadioGroup` `<ChoiceGroup>`: `{...(name !== undefined ? { ariaLabel: name } : {})}` — if `IChoiceGroupProps` has no `ariaLabel`, use `{ "aria-label": name }` (it reaches the radiogroup root through native props); the test pins whichever works.
- `V8DatePicker` `<DatePicker>`: `{...(name !== undefined ? { ariaLabel: name } : {})}`.
- `V8PeoplePicker` `inputProps`: add `...(name !== undefined ? { "aria-label": name } : {})`.
- `V8Combobox` `<ComboBox>`: `{...(name !== undefined ? { ariaLabel: name } : {})}`.
- `V8FileInput` hidden `<input>`: `{...(name !== undefined ? { "aria-label": name } : {})}`.
- `V8FieldDisplay` group div: `aria-labelledby` only when `p.label !== undefined`, else `{...(name !== undefined ? { "aria-label": name } : {})}`.
- `V8RichTextInput`: the fallback `<TextField>` gets `ariaLabel` as above; `LazyRichTextEditor` gets `ariaLabelledBy={p.label !== undefined ? aria.labelId : undefined}` and `ariaLabel={name}`. In `RichTextEditor.tsx` add `ariaLabel?: string | undefined;` to its props and `...(p.ariaLabel !== undefined ? { "aria-label": p.ariaLabel } : {})` beside the `aria-labelledby` attribute.
- `V8IconButton`: `ariaLabel={p.ariaLabel ?? p.title}`.

- [ ] **Step 5: Update `fakeAdapter.tsx`**

For TextInput, RichTextInput, NumberInput, DatePicker, PeoplePicker (first input), Combobox, FileInput, RadioGroup: destructure `ariaLabel` and use `aria-label={label ?? ariaLabel}` on the control (Dropdown and Checkbox already do `ariaLabel ?? label` — change to `label ?? ariaLabel` to match the rule). TextInput/NumberInput: destructure `placeholder`, put `placeholder={placeholder}` on the input/textarea; TextInput also `data-autogrow={autoGrow ? "" : undefined}`. IconButton: destructure `ariaLabel` and use `aria-label={ariaLabel ?? title}`.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run test/v8FieldNames.test.tsx test/fluentV8.primitives.test.tsx test/fluentV8.labels.test.tsx test/fluentV8.richtext.test.tsx && npm run typecheck && npm run test:types`
Expected: PASS. If `autoAdjustHeight` leaves `style.height` empty in jsdom, assert instead on Fluent's grow class: `expect(screen.getByLabelText("grow").className).toMatch(/autoAdjust|field/)` after inspecting the rendered DOM once — pin the observable difference between the two boxes.

- [ ] **Step 7: Commit**

```bash
git add packages/speel-react/src packages/speel-react/test/fakeAdapter.tsx packages/speel-react/test/v8FieldNames.test.tsx
git commit -m "feat(react): ariaLabel on every field primitive, placeholder, autoGrow, IconButton ariaLabel (#76)"
```

---

### Task 9: Pass-through — standalone fields and `SpeelField` (#76)

**Files:**

- Modify: `packages/speel-react/src/form/FieldHandle.ts`
- Modify: `packages/speel-react/src/form/useStandaloneField.ts`
- Modify: `packages/speel-react/src/fields/SpeelField.tsx`
- Modify: `packages/speel-react/src/fields/SelectionFieldBody.tsx:183-194`
- Test: `packages/speel-react/test/useStandaloneField.test.tsx`

**Interfaces:**

- Consumes: `FieldChrome.ariaLabel`, `TextInputProps.placeholder/autoGrow`, `NumberInputProps.placeholder` (Task 8).
- Produces: `StandaloneFieldOptions` and `FieldHandle` gain `ariaLabel?: string`, `placeholder?: string`, `autoGrow?: boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `useStandaloneField.test.tsx` (it renders through `fakeAdapter`; reuse its imports — `SpeelField`, `useStandaloneField`, `fakeAdapter`, RTL):

```tsx
describe("a standalone field named inline", () => {
  function Cell(p: {
    config: FieldConfig;
    value: unknown;
    autoGrow?: boolean;
  }) {
    const field = useStandaloneField({
      config: p.config,
      displayName: "Comments",
      value: p.value,
      onChange: () => {},
      ariaLabel: "Comments for item 7",
      placeholder: "Add a comment",
      ...(p.autoGrow ? { autoGrow: true } : {}),
    });
    return <SpeelField field={field} />;
  }
  const wrapCell = (node: JSX.Element) =>
    render(<SpeelUIProvider ui={fakeAdapter}>{node}</SpeelUIProvider>);

  it("Text: no label chrome, named by ariaLabel, with placeholder and autoGrow", () => {
    wrapCell(
      <Cell config={{ kind: "Text", multiline: true }} value="" autoGrow />,
    );
    expect(screen.queryByText("Comments")).toBeNull();
    const box = screen.getByLabelText("Comments for item 7");
    expect(box).toHaveAttribute("placeholder", "Add a comment");
    expect(box).toHaveAttribute("data-autogrow");
  });

  it("Choice: the combobox is named by ariaLabel and gets the placeholder", () => {
    wrapCell(
      <Cell
        config={{
          kind: "Choice",
          multi: false,
          fillIn: false,
          radioButtons: false,
          options: ["Open", "Closed"],
        }}
        value={null}
      />,
    );
    expect(screen.queryByText("Comments")).toBeNull();
    expect(screen.getByLabelText("Comments for item 7")).toHaveAttribute(
      "placeholder",
      "Add a comment",
    );
  });

  it("DateTime: named by ariaLabel", () => {
    wrapCell(
      <Cell
        config={{
          kind: "DateTime",
          displayFormat: "DateOnly",
          friendlyFormat: "Disabled",
        }}
        value={undefined}
      />,
    );
    expect(screen.getByLabelText("Comments for item 7")).toBeInTheDocument();
    expect(screen.queryByText("Comments")).toBeNull();
  });
});
```

Before writing, read the test file's top to reuse its provider wrapper (it may already render with `SpeelUIProvider`/`SpeelProvider`); use whichever wrapper the file's existing tests use, and match the `DateTimeFieldConfig` literal to `FieldConfig.ts:32`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/useStandaloneField.test.tsx`
Expected: FAIL — unknown options (typecheck) and the label "Comments" is rendered.

- [ ] **Step 3: Implement**

`FieldHandle.ts` (after `render`):

```ts
  /** Names the control inline instead of with the label chrome (a table cell). Standalone only. */
  readonly ariaLabel?: string;
  /** Shown while the control is empty. Standalone only. */
  readonly placeholder?: string;
  /** A multiline Text field grows with its content. Standalone only. */
  readonly autoGrow?: boolean;
```

`useStandaloneField.ts` — options (after `touched`):

```ts
  /**
   * Names the control without the label chrome — an editor in a table cell, whose column
   * header is the visible label. The field renders no label; this is its accessible name.
   */
  ariaLabel?: string;
  /** Shown while the control is empty (text, number, and the selection combobox). */
  placeholder?: string;
  /** A multiline Text field grows with its content instead of scrolling. */
  autoGrow?: boolean;
```

and in the returned handle:

```ts
    ...(opts.ariaLabel !== undefined ? { ariaLabel: opts.ariaLabel } : {}),
    ...(opts.placeholder !== undefined ? { placeholder: opts.placeholder } : {}),
    ...(opts.autoGrow !== undefined ? { autoGrow: opts.autoGrow } : {}),
```

`SpeelField.tsx` — a naming helper, used by `chromeOf` and every `ui.FieldDisplay`:

```ts
/** A field named inline (a table cell) carries `ariaLabel` and no label chrome. */
function nameOf(field: FieldHandle): Pick<FieldChrome, "label" | "ariaLabel"> {
  return field.ariaLabel !== undefined
    ? { ariaLabel: field.ariaLabel }
    : { label: field.displayName };
}
```

`chromeOf` starts from `{ ...nameOf(field), required: field.required, disabled: !field.enabled }`; each `<ui.FieldDisplay label={field.displayName}>` becomes `<ui.FieldDisplay {...nameOf(field)}>`. On `ui.TextInput`:

```tsx
          {...(field.placeholder !== undefined ? { placeholder: field.placeholder } : {})}
          {...(config.multiline && field.autoGrow ? { autoGrow: true } : {})}
```

On both `ui.NumberInput` (Number, Currency): the `placeholder` spread. `SelectionFieldBody.tsx` `ui.Combobox`: the `placeholder` spread from `field.placeholder`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run test/useStandaloneField.test.tsx test/SpeelField.test.tsx test/SpeelField.kinds.test.tsx test/EntityFields.test.tsx && npm run typecheck`
Expected: PASS (form-bound fields unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/speel-react/src/form packages/speel-react/src/fields packages/speel-react/test/useStandaloneField.test.tsx
git commit -m "feat(react): standalone fields take ariaLabel, placeholder and autoGrow (#76)"
```

---

### Task 10: v8 Dropdown — arrow keys on a closed list open it (#77)

**Files:**

- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (`V8Dropdown` single-select branch)
- Test: `packages/speel-react/test/v8DropdownKeys.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/speel-react/test/v8DropdownKeys.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { V8Dropdown } from "../src/fluent-v8/primitives.js";

const opts = [
  { key: "a", text: "Alpha", data: "a" },
  { key: "b", text: "Beta", data: "b" },
  { key: "c", text: "Gamma", data: "c" },
];
const KEYS = {
  ArrowDown: 40,
  ArrowUp: 38,
  Home: 36,
  End: 35,
} as const;
const press = (el: Element, key: keyof typeof KEYS, extra = {}) =>
  fireEvent.keyDown(el, {
    key,
    which: KEYS[key],
    keyCode: KEYS[key],
    ...extra,
  });

function setup() {
  const onChange = vi.fn();
  render(
    <V8Dropdown label="Status" value="b" options={opts} onChange={onChange} />,
  );
  return { onChange, box: screen.getByRole("combobox") };
}

describe("V8Dropdown on a closed single-select", () => {
  it.each(["ArrowDown", "ArrowUp"] as const)(
    "%s opens the list and keeps the value",
    (key) => {
      const { onChange, box } = setup();
      press(box, key);
      expect(onChange).not.toHaveBeenCalled();
      expect(box).toHaveAttribute("aria-expanded", "true");
    },
  );

  it.each(["Home", "End"] as const)("%s does nothing", (key) => {
    const { onChange, box } = setup();
    press(box, key);
    expect(onChange).not.toHaveBeenCalled();
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("Alt+ArrowDown still opens it", () => {
    const { onChange, box } = setup();
    press(box, "ArrowDown", { altKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(box).toHaveAttribute("aria-expanded", "true");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/v8DropdownKeys.test.tsx`
Expected: FAIL — ArrowDown/ArrowUp/Home/End call `onChange`.

- [ ] **Step 3: Implement**

Add `IDropdown` to the `@fluentui/react` import. Above `V8Dropdown`:

```tsx
/**
 * Fluent's closed single-select Dropdown changes its value on ArrowUp/ArrowDown and
 * Home/End, so a keyboard user passing through an inline-edit row silently edits it.
 * Closed, the arrows open the list instead (what Radix Select does in the shadcn skin)
 * and Home/End do nothing. Alt/Meta+Arrow keep Fluent's meaning; an open list is untouched.
 * Fluent skips its own handling of a key event the consumer's onKeyDown prevented.
 */
function keepClosedValue(
  e: React.KeyboardEvent<HTMLElement>,
  dropdown: React.RefObject<IDropdown>,
): void {
  if (e.currentTarget.getAttribute("aria-expanded") === "true") return;
  if (e.altKey || e.metaKey) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    dropdown.current?.focus(true);
  } else if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
  }
}
```

In `V8Dropdown`, `const dropdownRef = React.useRef<IDropdown>(null);` and on the single-select `<Dropdown>`:

```tsx
        componentRef={dropdownRef}
        onKeyDown={(e) => keepClosedValue(e, dropdownRef)}
```

If the `aria-expanded` read is on a child rather than `currentTarget`, read it from `e.currentTarget.querySelector('[role="combobox"]') ?? e.currentTarget` — check once in the test DOM.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/v8DropdownKeys.test.tsx test/fluentV8.primitives.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/speel-react/src/fluent-v8/primitives.tsx packages/speel-react/test/v8DropdownKeys.test.tsx
git commit -m "fix(react): arrow keys open a closed v8 Dropdown instead of changing its value (#77)"
```

---

### Task 11: shadcn skin — surfaces, popover, buttons, field names

**Files:**

- Modify: `registry/src/speel-shadcn/overlays.tsx` (`ShadDialog`, `ShadDrawer`, `ShadPopover`)
- Modify: `registry/src/speel-shadcn/fields.tsx` (`ShadButton`, `ShadIconButton`, `ShadTextInput`, `ShadNumberInput`, `ShadCheckbox`, `ShadDropdown`)
- Modify: `registry/src/speel-shadcn/chrome.tsx` (`fieldAria`)
- Modify: `registry/src/speel-shadcn/rich-text.tsx`
- Create: `registry/tests/focusSpy.ts` (same content as `packages/speel-react/test/focusSpy.ts`)
- Test: `registry/tests/overlays-focus.test.tsx`, `registry/tests/field-names.test.tsx`
- Regenerate: `registry/public/r/*.json`, `samples/spfx-sample/src/components/speel/*`

**Interfaces:**

- Consumes: `useFocusReturn`, `usePopoverFocus`, every contract field from Tasks 3, 5, 8 (via the built `@speel/react` dist).

- [ ] **Step 1: Build the packages so the registry sees the new API**

Run: `npm run build` (repo root)
Expected: success.

- [ ] **Step 2: Write the failing tests**

```tsx
// registry/tests/overlays-focus.test.tsx
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState, type ComponentType } from "react";
import type { DrawerProps, ReturnFocusTarget } from "@speel/react";
import { shadcnAdapter } from "@/speel-shadcn/adapter";
import { spyFocus, type FocusCall } from "./focusSpy";

afterEach(() => {
  document.body.innerHTML = "";
});

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
};

describe.each([
  ["Dialog", shadcnAdapter.Dialog as ComponentType<DrawerProps>],
  ["Drawer", shadcnAdapter.Drawer],
])("shadcn %s focus return", (_n, Surface) => {
  async function cycle(returnFocus?: ReturnFocusTarget): Promise<{
    calls: FocusCall[];
    opener: HTMLButtonElement;
  }> {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const rf = returnFocus !== undefined ? { returnFocus } : {};
    const ui = (open: boolean) => (
      <Surface open={open} onOpenChange={() => {}} title="S" {...rf}>
        <button>inside</button>
      </Surface>
    );
    const { rerender } = render(ui(false));
    rerender(ui(true));
    await flush();
    screen.getByText("inside").focus();
    const spy = spyFocus();
    rerender(ui(false));
    await flush();
    spy.restore();
    return { calls: spy.calls, opener };
  }

  it("returns to the opener with preventScroll", async () => {
    const { calls, opener } = await cycle();
    expect(calls.at(-1)).toEqual({ el: opener, opts: { preventScroll: true } });
  });

  it("goes to returnFocus, or nowhere with false", async () => {
    const named = document.createElement("button");
    document.body.appendChild(named);
    expect((await cycle(named)).calls.at(-1)?.el).toBe(named);
    expect((await cycle(false)).calls).toEqual([]);
  });
});

describe("shadcn Popover", () => {
  function Harness({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) {
    const [open, setOpen] = useState(false);
    const P = shadcnAdapter.Popover;
    const B = shadcnAdapter.Button;
    return (
      <P
        label="Contact"
        open={open}
        onOpenChange={(o) => {
          onOpenChange?.(o);
          setOpen(o);
        }}
        trigger={(t) => (
          <B text="Org" {...t} onClick={() => setOpen((o) => !o)} />
        )}
      >
        <a href="mailto:x@example.com">mail</a>
      </P>
    );
  }

  it("puts the aria wiring on the button, not a wrapper", () => {
    render(<Harness />);
    const org = screen.getByRole("button", { name: "Org" });
    expect(org).toHaveAttribute("aria-haspopup", "dialog");
    expect(org).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(org);
    const dialog = screen.getByRole("dialog", { name: "Contact" });
    expect(org).toHaveAttribute("aria-expanded", "true");
    expect(org).toHaveAttribute("aria-controls", dialog.id);
  });

  it("Tab past the last element closes and focuses the trigger", async () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const org = screen.getByRole("button", { name: "Org" });
    fireEvent.click(org);
    const mail = screen.getByText("mail");
    mail.focus();
    fireEvent.keyDown(mail, { key: "Tab" });
    await flush();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(org);
  });

  it("Esc closes and focuses the trigger", async () => {
    render(<Harness />);
    const org = screen.getByRole("button", { name: "Org" });
    fireEvent.click(org);
    fireEvent.keyDown(screen.getByText("mail"), { key: "Escape" });
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(org);
  });
});
```

```tsx
// registry/tests/field-names.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { shadcnAdapter as ui } from "@/speel-shadcn/adapter";

const none = vi.fn();
const NAME = "Comments for item 7";
const opts = [{ key: "a", text: "Alpha", data: "a" }];

describe("shadcn field primitives are named by ariaLabel when they have no label", () => {
  it.each([
    ["TextInput", <ui.TextInput ariaLabel={NAME} value="" onChange={none} />],
    [
      "NumberInput",
      <ui.NumberInput ariaLabel={NAME} value={undefined} onChange={none} />,
    ],
    [
      "Checkbox",
      <ui.Checkbox ariaLabel={NAME} checked={false} onChange={none} />,
    ],
    [
      "Dropdown",
      <ui.Dropdown
        ariaLabel={NAME}
        value={undefined}
        options={opts}
        onChange={none}
      />,
    ],
    [
      "RadioGroup",
      <ui.RadioGroup
        ariaLabel={NAME}
        value={undefined}
        options={opts}
        onChange={none}
      />,
    ],
    [
      "DatePicker",
      <ui.DatePicker ariaLabel={NAME} value={undefined} onChange={none} />,
    ],
    [
      "Combobox",
      <ui.Combobox
        ariaLabel={NAME}
        value={[]}
        onChange={none}
        onResolveSuggestions={async () => []}
      />,
    ],
    [
      "FileInput",
      <ui.FileInput ariaLabel={NAME} value={undefined} onChange={none} />,
    ],
  ])("%s", (_n, node) => {
    render(node);
    expect(screen.getAllByLabelText(NAME).length).toBeGreaterThan(0);
  });

  it("placeholder on TextInput and NumberInput; IconButton ariaLabel", () => {
    render(
      <>
        <ui.TextInput
          ariaLabel="t"
          placeholder="Add a comment"
          value=""
          onChange={none}
        />
        <ui.NumberInput
          ariaLabel="n"
          placeholder="0.00"
          value={undefined}
          onChange={none}
        />
        <ui.IconButton iconName="Edit" title="Edit" ariaLabel="Edit item 7" />
      </>,
    );
    expect(screen.getByPlaceholderText("Add a comment")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("0.00")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit item 7" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm --prefix registry test -- overlays-focus field-names`
Expected: FAIL.

- [ ] **Step 4: Implement**

`chrome.tsx` `fieldAria` — add to the return type `"aria-label"?: string;` and to the object:

```ts
    // Named inline (a table cell) when no label is shown.
    ...(!p.label && p.ariaLabel !== undefined ? { "aria-label": p.ariaLabel } : {}),
```

`overlays.tsx`:

- Import `PopoverAnchor` instead of `PopoverTrigger`; import `useFocusReturn, usePopoverFocus` from `@speel/react`.
- `ShadDialog` and `ShadDrawer`: `const { restore } = useFocusReturn({ open: p.open, returnFocus: p.returnFocus });` and on `DialogContent` / `SheetContent`:

```tsx
        // Focus return is speel's (useFocusReturn), so returnFocus behaves the same in
        // every skin. A Radix Dialog/Sheet is modal: focus was inside.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          restore(true);
        }}
```

- `ShadPopover`:

```tsx
export function ShadPopover(p: PopoverProps): ReactElement {
  const f = usePopoverFocus(p);
  return (
    <Popover open={p.open} onOpenChange={p.onOpenChange}>
      {/* An anchor, not a PopoverTrigger: the trigger is the consumer's own button (it
          toggles `open` itself, as the contract says), and the aria wiring goes on it
          through the trigger function — never on a wrapper that cannot take focus. */}
      <PopoverAnchor asChild>
        <span ref={f.anchorRef} className="inline-flex">
          {f.renderTrigger(p.trigger)}
        </span>
      </PopoverAnchor>
      <PopoverContent
        id={f.contentId}
        aria-label={p.label}
        align="start"
        className="speel-shadcn w-auto min-w-60"
        onKeyDown={f.onContentKeyDown}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          f.restore(false);
        }}
      >
        {p.children as ReactNode}
      </PopoverContent>
    </Popover>
  );
}
```

`fields.tsx`:

- `ShadButton` / `ShadIconButton` `<Button>`: `aria-expanded={p.ariaExpanded}`, `aria-haspopup={p.ariaHasPopup}`, `aria-controls={p.ariaControls}`; `ShadIconButton` `aria-label={p.ariaLabel ?? p.title}`.
- `ShadTextInput`: `placeholder: p.placeholder` in `shared` (only when defined); the textarea already sizes to content (`field-sizing-content`), so `autoGrow` needs no class — add a comment saying so.
- `ShadNumberInput`: `placeholder={p.placeholder}` on the `Input`.
- `ShadCheckbox`: `aria-label={p.label ? undefined : p.ariaLabel}`.
- `ShadDropdown`: delete the two explicit `ariaLabel` spreads — `fieldAria` now sets it, and only when there is no label.
- Any primitive whose control does not spread `fieldAria` and the test still fails on: add the `fieldAria` `aria-label` key to that control explicitly.

`rich-text.tsx` editor attributes: add `...(aria["aria-label"] !== undefined ? { "aria-label": aria["aria-label"] } : {})`.

- [ ] **Step 5: Run registry gates**

Run: `npm --prefix registry run typecheck && npm --prefix registry test`
Expected: PASS (including the existing link/button/table/rich-text suites).

- [ ] **Step 6: Regenerate the registry JSON and the sample copy**

Run: `npm --prefix registry run registry:build && npm run sync:skin && npm run check:skin`
Expected: `public/r` and `samples/spfx-sample/src/components/speel/*` updated; check passes.

- [ ] **Step 7: Commit**

```bash
git add registry samples/spfx-sample/src/components/speel
git commit -m "feat(shadcn): returnFocus, popover anchor + aria wiring, button aria, inline field names (#71 #72 #76)"
```

---

### Task 12: Docs, changeset, full verification

**Files:**

- Modify: `packages/speel-core/docs/modeling.md`, `packages/speel-core/docs/shapes.md`
- Modify: `packages/speel-react/docs/surfaces.md`, `packages/speel-react/docs/skins.md`, `packages/speel-react/docs/fields.md`
- Create: `.changeset/codec-overlay-a11y.md`

- [ ] **Step 1: Core docs**

`modeling.md`, codec section (near line 167) — add to Capabilities:

```md
A codec's provider pair runs **per element** only on a multi-valued column (a multi Lookup or
multi Choice). Every other column hands the codec its whole value — a Note whose model is a list
(`toProvider: JSON.stringify`) saves one string.
```

`shapes.md`, Boundaries & gotchas:

```md
**Rows saved by 0.1.0-beta.3 or earlier with an array-model codec on a property inside a shape**
hold that property as an array of per-element values; they do not read back. Re-save them from a
build that has the per-element rule.
```

Keep `modeling.md` ≤ 250 lines by tightening existing prose in its Capabilities section (never dropping a capability).

- [ ] **Step 2: React docs**

`surfaces.md` Capabilities:

```md
**Focus comes back without moving the page.** Closing a panel or modal returns focus to what had
it when the surface opened, with `preventScroll` — never to `body`, never to an element that has
since left the page, and never away from somewhere the user moved focus. `returnFocus` names a
different target (an element, or a function called at close — the list after a panel deleted its
row) or `false` to leave focus alone; `showForm` takes it too.
```

`fields.md` Capabilities (standalone section):

```md
A standalone field can sit in a table cell: `ariaLabel` names it in place of the label chrome
("Comments for item 7"), `placeholder` hints at an empty box, and `autoGrow` lets a multiline
Text field grow with its content.
```

`skins.md` Capabilities — add, then condense the page back to ≤ 250 lines:

```md
**Popovers are labelled dialogs.** `PopoverProps.label` names the popup; `trigger` may be a
function that receives `{ ariaExpanded, ariaHasPopup, ariaControls }` — spread it onto
`ui.Button`/`ui.IconButton`, which take the same three fields. Tab past either end, Esc and an
outside click close it and return focus to the trigger. Skins build this with `usePopoverFocus`;
dialogs and drawers return focus with `useFocusReturn`.

**Every field primitive takes `ariaLabel`** for when no label is shown; a visible `label` wins.
Text and number inputs take `placeholder`, a multiline text input `autoGrow`, and an icon
button `ariaLabel` beside its `title` tooltip. A closed v8 Dropdown opens on the arrow keys
instead of changing its value.
```

Re-verify the canonical examples on each touched page against `packages/speel-react/src/index.ts` and `packages/speel-core/src/index.ts` exports (read them).

- [ ] **Step 3: Changeset**

```md
---
"@speel/core": patch
"@speel/react": minor
---

A codec runs per element only on multi-valued columns (#69). Panels and modals return focus without scrolling the page, with `returnFocus` to choose the target (#71). Popovers are labelled dialogs with trigger aria wiring, Tab-out and focus return (#72). Field primitives take `ariaLabel`, text and number inputs `placeholder`, multiline text `autoGrow`, icon buttons `ariaLabel`; standalone fields pass them through (#76). Arrow keys open a closed v8 Dropdown instead of changing its value (#77).
```

- [ ] **Step 4: Full verification**

Run: `npm run verify` (root; outside the sandbox if the sample's heft/playwright needs it)
Expected: every stage passes — scripts tests, build, `check:node-esm`, typecheck, tests, registry typecheck/test/`build:check`, `check:skin`, sample `build:check` and `test:layout`.

- [ ] **Step 5: Commit**

```bash
git add packages/speel-core/docs packages/speel-react/docs .changeset/codec-overlay-a11y.md
git commit -m "docs: per-element codec rule, focus return, popover semantics, inline field names"
```
