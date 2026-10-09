# Table Align, Link Buttons, Tooltip Anchoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #70 and #58: a column `align` option honoured by both table skins, a `"link"` button appearance (inline, left-aligned, end-truncating, full text on hover) in both skins, and tooltip hosts that are always the same box as their button.

**Architecture:** `align` flows `ColumnOptions` → `ResolvedColumn` → `TableColumn` → skins (header label box + cell content box). `appearance: "link"` is a new `ButtonProps` value each skin renders with its own link control plus the shared `setOverflowTitle`. Tooltip anchoring is a styling contract in each skin's `Button`.

**Tech Stack:** TypeScript 5.4 (strict, `exactOptionalPropertyTypes`), React 17, Fluent UI v8 (8.125: `Link`, `TooltipHost`), shadcn/Tailwind v4 (registry + synced sample copy), vitest + Testing Library, Playwright layout project (`samples/spfx-sample/tests/layout/`, both skins).

**Spec:** `docs/superpowers/specs/2026-10-08-table-align-link-design.md`

## Global Constraints

- **Worktree:** every command runs in `/home/peter/source/repos/backlundpf/speel/.claude/worktrees/table-columns` (branch `feat/table-columns-57-62-67`, PR #68). Start every Bash session with `cd /home/peter/source/repos/backlundpf/speel/.claude/worktrees/table-columns && pwd`; absolute paths under it. Never touch the main checkout or another worktree. Never push.
- **Public repo:** no consumer app, org, tenant or account names anywhere (issue #70 names one — never copy it).
- **Node ESM:** relative imports inside `packages/` carry `.js`. **`exactOptionalPropertyTypes`:** conditional spreads, never `undefined` into an optional member.
- **Skins:** new adapter members go into the v8 skin, the test `fakeAdapter`, and the registry shadcn skin (author in `registry/src/speel-shadcn/`, then `npm --prefix registry run registry:build` + `npm run sync:skin` + `npm run check:skin`; never hand-edit `samples/spfx-sample/src/components/speel/`).
- **Builds:** `npm run build -w @speel/react` before registry tests/typecheck, the sample build, or `npm --prefix samples/spfx-sample run test:layout` (which builds the sample's Tailwind CSS itself).
- **Formatting:** `npx prettier --write <changed files>` before each commit. npm installs use `--cache "$TMPDIR/npm-cache"`.
- **Commits** end with exactly:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi
  ```
- **`align` (exact):** `"start" | "center" | "end"`, absent = start; v8 uses CSS `text-align: start | center | end`; shadcn uses `text-start | text-center | text-end`. No per-kind default. No vertical alignment.
- **Link (exact):** v8 = Fluent `Link` (a `<button>`) styled `display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: top; text-align: start`; shadcn = `Button variant="link"` with `h-auto p-0 max-w-full justify-start text-left` and the label in a `truncate` span. Truncation is always at the END. A cut-off link sets its own `title` (full text) on hover via `setOverflowTitle`, unless the button has a `tooltip`.
- **Tooltip anchoring (exact):** v8 `TooltipHost` root `display: inline-block` and the wrapped button root `width: 100%`; shadcn trigger span keeps `inline-flex` and the wrapped button gets `w-full`.

## Review Focus

- **A link whose text is short** must not stretch or change line height — a link row must be no taller than a plain-text row. Pinned in Task 3/4 layout tests.
- **`align: "end"` with a filter button** — the label must end at the label box's end (next to the button), not under it. Pinned in Task 2 layout test (column with `headerFilter`).
- **A disabled link with a tooltip** (v8 `allowDisabledFocus` path) still shows its tooltip and never fires `onClick`. Pinned in Task 3 jsdom test.
- **Tooltip host in a horizontal flex row** (a toolbar) must not stretch the button. Pinned in Task 3/4 layout tests (a flex-row container alongside block and flex-column).
- **`align` on a column with `cellTitle: false`** still aligns (v8 must route it through `V8Cell`). Pinned in Task 2 jsdom test.

---

### Task 1: `align` plumbing (core)

**Files:**

- Modify: `packages/speel-react/src/table/columns.ts` (`ColumnOptions`, `ResolvedColumn`, `descriptorColumn`)
- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`TableColumn.align`, export `ColumnAlign` type)
- Modify: `packages/speel-react/src/table/SpeelTable.tsx` (`tableColumns` map)
- Modify: `packages/speel-react/src/index.ts` (export `ColumnAlign`)
- Modify: `packages/speel-react/test/fakeAdapter.tsx` (`data-align` on `th` and `td`)
- Test: `packages/speel-react/test/SpeelTable.columnOptions.test.tsx`

**Interfaces:**

- Produces: `export type ColumnAlign = "start" | "center" | "end";` (adapter file); `ColumnOptions.align?: ColumnAlign`; `ResolvedColumn.align?: ColumnAlign`; `TableColumn.align?: ColumnAlign`.

- [ ] **Step 1: Failing tests** — append to `packages/speel-react/test/SpeelTable.columnOptions.test.tsx`:

```tsx
it("carries align to the skin, header and cells", () => {
  const { container } = wrap(
    <SpeelTable
      of={Org}
      items={rows}
      columns={(p) => [p.Title.with({ align: "end" }), p.Notes]}
    />,
  );
  expect(head(container, 0).dataset["align"]).toBe("end");
  expect(cell(container, 0).dataset["align"]).toBe("end");
  expect(head(container, 1).dataset["align"]).toBeUndefined();
});

it("accepts align on a custom descriptor", () => {
  const { container } = wrap(
    <SpeelTable
      of={Org}
      items={rows}
      columns={[{ key: "n", header: "N", align: "center", render: () => "1" }]}
    />,
  );
  expect(head(container, 0).dataset["align"]).toBe("center");
});
```

- [ ] **Step 2: Run to verify they fail** — from `packages/speel-react`: `npx vitest --run test/SpeelTable.columnOptions.test.tsx`. Expected: FAIL (`data-align` undefined; TS error on `align`).

- [ ] **Step 3: Implement**

`SpeelUIAdapter.ts`, above `TableColumn`:

```ts
/** Horizontal alignment of a column's header and cells. */
export type ColumnAlign = "start" | "center" | "end";
```

and in `TableColumn`:

```ts
  /** Header and cell alignment; absent = start. */
  align?: ColumnAlign;
```

`columns.ts`: import `type ColumnAlign` from the adapter; `ColumnOptions<T>` gets `/** Header and cell alignment. Default "start". */ align?: ColumnAlign;`; `ResolvedColumn<T>` gets `align?: ColumnAlign;`; in `descriptorColumn`'s `base`: `...(d.align !== undefined && d.align !== "start" ? { align: d.align } : {}),`.

`SpeelTable.tsx` `tableColumns` map: `...(c.align !== undefined ? { align: c.align } : {}),`.

`index.ts`: add `ColumnAlign` to the adapter type exports.

`fakeAdapter.tsx`: on each `<th>` and each body `<td>` add `data-align={c.align}`.

- [ ] **Step 4: Run** — `npm test -w @speel/react`. Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/speel-react/src/table/columns.ts packages/speel-react/src/adapter/SpeelUIAdapter.ts packages/speel-react/src/table/SpeelTable.tsx packages/speel-react/src/index.ts packages/speel-react/test/fakeAdapter.tsx packages/speel-react/test/SpeelTable.columnOptions.test.tsx
git add <the same files>
git commit -m "feat(react): column align option (#70)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi"
```

---

### Task 2: v8 honours `align`

**Files:**

- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (`V8HeaderCell` label box, `V8Cell`, the `onRender` routing)
- Test: `packages/speel-react/test/v8TableHeader.test.tsx`, `packages/speel-react/test/v8TableCells.test.tsx`
- Modify: `samples/spfx-sample/tests/layout/fixture.tsx`, `samples/spfx-sample/tests/layout/tableLayout.spec.ts`

**Interfaces:** consumes `TableColumn.align` (Task 1).

- [ ] **Step 1: Failing jsdom tests**

`v8TableHeader.test.tsx`:

```tsx
it("aligns the header label box with the column", () => {
  const { container } = render(
    <V8Table
      columns={[column({ align: "end" })]}
      items={items}
      containerWidth={300}
    />,
  );
  const box = container.querySelector<HTMLElement>("[data-header-label]")!;
  expect(box.style.textAlign).toBe("end");
});
```

`v8TableCells.test.tsx`:

```tsx
it("aligns the cell content box with the column", () => {
  const { container } = render(
    <V8Table
      columns={[column({ align: "center", cellTitle: () => "x" })]}
      items={items}
      containerWidth={300}
    />,
  );
  expect(cellContent(container).style.textAlign).toBe("center");
});

it("routes an aligned column through the content box even without a hover title", () => {
  const { container } = render(
    <V8Table
      columns={[column({ align: "end" })]}
      items={items}
      containerWidth={300}
    />,
  );
  const el = cellContent(container);
  expect(el.tagName).toBe("DIV");
  expect(el.style.textAlign).toBe("end");
});
```

- [ ] **Step 2: Failing layout scenario** — in `fixture.tsx` append to `scenarios`:

```tsx
  {
    name: "align",
    containerWidth: 1200,
    columns: [
      col("n", "Open items", {
        width: 160,
        align: "end",
        sortable: true,
        headerFilter: filter,
        cellTitle: (r) => (r as Row)["n"] ?? "",
      }),
      col("filler", "Filler", { width: 50 }),
    ],
    items: [{ n: "42", filler: "" }],
  },
```

In `tableLayout.spec.ts`:

```ts
test("align end puts the header label and the cell text at the column's end", async ({
  page,
}) => {
  await open(page);
  const s = scenario(page, "align");
  const box = headerCells(s).nth(0).locator("[data-header-label]");
  const button = headerCells(s).nth(0).locator('button[aria-label^="Filter"]');
  const labelEnd = await box.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().right;
  });
  const boxRight = await box.evaluate((el) => el.getBoundingClientRect().right);
  expect(labelEnd).toBeGreaterThan(boxRight - 12); // flush with the box end (sort-label padding allowed)
  expect(labelEnd).toBeLessThanOrEqual((await button.boundingBox())!.x + 0.5); // never under the button
  const cellBox = rowCells(s, 0).nth(0).locator(":scope > div");
  const textEnd = await cellBox.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().right;
  });
  const contentRight = await cellBox.evaluate((el) => {
    const cs = getComputedStyle(el);
    return el.getBoundingClientRect().right - parseFloat(cs.paddingRight);
  });
  expect(Math.abs(textEnd - contentRight)).toBeLessThanOrEqual(1);
});
```

(Use whatever helper names the spec file already has; `open`/`scenario`/`headerCells`/`rowCells` exist.)

- [ ] **Step 3: Run to verify they fail** — jsdom: `npx vitest --run test/v8TableHeader.test.tsx test/v8TableCells.test.tsx`; layout: `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`. Expected: the new tests FAIL.

- [ ] **Step 4: Implement** — in `primitives.tsx`:

- `V8HeaderCell`: the label box `style={{ ...HEADER_LABEL_BOX_STYLE, ...(column.align ? { textAlign: column.align } : {}) }}`.
- `V8Cell`: `style={{ ...(column.wrap ? CELL_WRAP_STYLE : CELL_LINE_STYLE), ...(column.align ? { textAlign: column.align } : {}) }}`.
- `onRender`: `c.cellTitle || c.wrap || c.align ? <V8Cell column={c} row={item} /> : c.render(item)` — update the `V8Cell` doc comment ("only for columns that wrap, have a title, or align").

- [ ] **Step 5: Run both suites** — expected all PASS.

- [ ] **Step 6: Commit** — `feat(react): v8 table honours column align (#70)` (prettier first; add the five files; trailers).

---

### Task 3: v8 link appearance and tooltip anchoring

**Files:**

- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`ButtonProps.appearance` adds `"link"`, doc comment)
- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (`V8Button`; import `Link` from `@fluentui/react`; import `setOverflowTitle` already present)
- Test: `packages/speel-react/test/v8Button.test.tsx` (create, or extend the existing v8 button test file if one exists — grep `V8Button` in `test/`)
- Modify: `samples/spfx-sample/tests/layout/fixture.tsx`, `samples/spfx-sample/tests/layout/tableLayout.spec.ts`

**Interfaces:** produces `ButtonProps.appearance: "primary" | "secondary" | "subtle" | "danger" | "link"`.

- [ ] **Step 1: Failing jsdom tests** (`v8Button.test.tsx`):

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { V8Button } from "../src/fluent-v8/primitives.js";

const sized = (
  el: HTMLElement,
  scrollWidth: number,
  clientWidth: number,
): void => {
  Object.defineProperty(el, "scrollWidth", {
    value: scrollWidth,
    configurable: true,
  });
  Object.defineProperty(el, "clientWidth", {
    value: clientWidth,
    configurable: true,
  });
};

describe("V8Button appearance link", () => {
  it("renders a Fluent Link as a button that truncates at the end", () => {
    const onClick = vi.fn();
    render(
      <V8Button appearance="link" text="A long title" onClick={onClick} />,
    );
    const link = screen.getByRole("button", { name: "A long title" });
    expect(link.className).toContain("ms-Link");
    const cs = getComputedStyle(link);
    expect([
      cs.display,
      cs.overflow,
      cs.textOverflow,
      cs.whiteSpace,
      cs.maxWidth,
    ]).toEqual(["inline-block", "hidden", "ellipsis", "nowrap", "100%"]);
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("titles a cut-off link with its text on hover, and a fitting one not at all", () => {
    render(<V8Button appearance="link" text="A long title" />);
    const link = screen.getByRole("button", { name: "A long title" });
    sized(link, 200, 80);
    fireEvent.mouseEnter(link);
    expect(link.title).toBe("A long title");
    sized(link, 80, 80);
    fireEvent.mouseEnter(link);
    expect(link.hasAttribute("title")).toBe(false);
  });

  it("leaves hover text to the tooltip when there is one", () => {
    render(
      <V8Button appearance="link" text="A long title" tooltip="Open it" />,
    );
    const link = screen.getByRole("button", { name: "A long title" });
    sized(link, 200, 80);
    fireEvent.mouseEnter(link);
    expect(link.hasAttribute("title")).toBe(false);
  });

  it("keeps a disabled link's tooltip reachable and never fires onClick", () => {
    const onClick = vi.fn();
    render(
      <V8Button
        appearance="link"
        text="Go"
        tooltip="Not yet"
        disabled
        onClick={onClick}
      />,
    );
    const link = screen.getByRole("button", { name: "Go" });
    fireEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
    expect(link.getAttribute("aria-describedby")).toBeTruthy();
  });
});

describe("V8Button tooltip anchoring", () => {
  it("makes the tooltip host inline-block and the button fill it", () => {
    const { container } = render(<V8Button text="Submit" tooltip="Sends it" />);
    const host = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(host).display).toBe("inline-block");
    const button = screen.getByRole("button", { name: "Submit" });
    expect(getComputedStyle(button).width).toBe("100%");
  });
});
```

(If Fluent's merge-styles classes don't surface in jsdom's `getComputedStyle`, assert the same values via the element's class rules or move the visual assertions to the layout test and keep the jsdom test to role/class/title/click. Report which.)

- [ ] **Step 2: Failing layout scenarios** — extend `fixture.tsx`:
  - A table scenario `"link"` (containerWidth 1200): `col("t", "Title", { width: 120, render: (r) => <V8Button appearance="link" text={(r as Row)["t"] ?? ""} onClick={() => undefined} />, cellTitle: (r) => (r as Row)["t"] ?? "" })`, `col("p", "Plain", { width: 120 })`, `col("filler", "Filler", { width: 50 })`; items `[{ t: "Due within the first fourteen days of entry", p: "plain", filler: "" }, { t: "Short", p: "plain", filler: "" }]`. Import the adapter's Button: `const V8Button = fluentV8Adapter.Button;`.
  - Three tooltip sections rendered after the tables in `App`: `section[data-scenario="tip-block"]` (a plain `div` containing `<V8Button text="Submit" tooltip="Sends it" />`), `section[data-scenario="tip-column"]` (`div` with `display: flex; flexDirection: column; width: 400`), `section[data-scenario="tip-row"]` (`div` with `display: flex; width: 400`).

  `tableLayout.spec.ts`:

```ts
test.describe("link buttons", () => {
  test("a long link title shows its beginning, ends cut off, and hovers its full text", async ({
    page,
  }) => {
    await open(page);
    const s = scenario(page, "link");
    const link = rowCells(s, 0).nth(0).locator(".ms-Link");
    const cell = rowCells(s, 0).nth(0);
    const firstCharLeft = await link.evaluate((el) => {
      const node = document
        .createTreeWalker(el, NodeFilter.SHOW_TEXT)
        .nextNode()!;
      const r = document.createRange();
      r.setStart(node, 0);
      r.setEnd(node, 1);
      return r.getBoundingClientRect().left;
    });
    const cellBox = (await cell.boundingBox())!;
    expect(firstCharLeft).toBeGreaterThanOrEqual(cellBox.x); // the beginning is visible
    expect(await link.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    );
    await link.hover();
    await expect(link).toHaveAttribute(
      "title",
      "Due within the first fourteen days of entry",
    );
  });

  test("a link row is no taller than a plain text row", async ({ page }) => {
    await open(page);
    const s = scenario(page, "link");
    const rows = s.locator('[data-automationid="DetailsRow"]');
    const linkRow = (await rows.nth(1).boundingBox())!.height;
    const authored = scenario(page, "authored-widths")
      .locator('[data-automationid="DetailsRow"]')
      .first();
    expect(linkRow).toBeLessThanOrEqual(
      (await authored.boundingBox())!.height + 0.5,
    );
  });
});

test.describe("tooltip anchoring", () => {
  for (const name of ["tip-block", "tip-column", "tip-row"]) {
    test(`the tooltip host is the button's box (${name})`, async ({ page }) => {
      await open(page);
      const s = page.locator(`section[data-scenario="${name}"]`);
      const button = s.getByRole("button", { name: "Submit" });
      const host = button.locator("xpath=..");
      const [b, h] = [
        (await button.boundingBox())!,
        (await host.boundingBox())!,
      ];
      expect(
        Math.abs(b.x - h.x) + Math.abs(b.width - h.width),
      ).toBeLessThanOrEqual(1);
    });
  }
});
```

(Fluent's `TooltipHost` may wrap the button in more than one element; locate the host as the element carrying the `TooltipHost` root class `.ms-TooltipHost` within the section instead of `..` if so.)

- [ ] **Step 3: Run to verify they fail.**

- [ ] **Step 4: Implement**

`SpeelUIAdapter.ts` `ButtonProps.appearance`: `"primary" | "secondary" | "subtle" | "danger" | "link"` and extend the comment: `` `link` is inline text that truncates at its end — for an action inside running text or a table cell. ``

`primitives.tsx` (`V8Button`):

```tsx
/** An inline text button: one line, cut off at its end, never centred. */
const LINK_STYLES = {
  root: {
    display: "inline-block",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    verticalAlign: "top",
    textAlign: "start",
  },
};
/** The wrapped button fills its tooltip host, so the host and the button are one box. */
const FILL_HOST = { root: { width: "100%" } };
const TOOLTIP_HOST_STYLES = { root: { display: "inline-block" } };
```

- For `appearance === "link"` render (instead of `Btn`):
  ```tsx
  <Link
    styles={
      p.tooltip !== undefined
        ? { root: { ...LINK_STYLES.root, width: "100%" } }
        : LINK_STYLES
    }
    type={p.type ?? "button"}
    disabled={!!p.disabled}
    {...(p.ariaLabel !== undefined ? { "aria-label": p.ariaLabel } : {})}
    {...(p.onClick ? { onClick: p.onClick } : {})}
    {...(p.tooltip !== undefined
      ? { "aria-describedby": tooltipId }
      : {
          onMouseEnter: (e: React.MouseEvent<HTMLElement>) =>
            setOverflowTitle(e.currentTarget, () => p.text),
        })}
    data-appearance="link"
  >
    {p.iconName !== undefined ? (
      <>
        <Icon
          iconName={p.iconName}
          aria-hidden
          style={{ marginRight: 4, verticalAlign: "middle" }}
        />
        {p.text}
      </>
    ) : (
      p.text
    )}
  </Link>
  ```
  (A disabled Fluent `Link` with `onClick` keeps focusability via `aria-disabled` — verify the disabled+tooltip test; if the native `disabled` attribute blocks the tooltip, render it focusable with `aria-disabled` and swallow the click, mirroring `allowDisabledFocus`.)
- For the other appearances, when `p.tooltip !== undefined`, merge `FILL_HOST` into the button's `styles` (with `dangerStyles` when danger).
- Wrap with `<TooltipHost content={p.tooltip} id={tooltipId} styles={TOOLTIP_HOST_STYLES}>`.

- [ ] **Step 5: Run both suites** — `npm test -w @speel/react`; `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout`. Expected: all PASS.

- [ ] **Step 6: Commit** — `feat(react): link button appearance; tooltip host is the button's box (#70 #58)` (prettier; add the files; trailers).

---

### Task 4: shadcn — align, link, tooltip anchoring

**Files:**

- Modify: `registry/src/speel-shadcn/table.tsx` (header label box + `td` alignment classes)
- Modify: `registry/src/speel-shadcn/fields.tsx` (`ShadButton`: `link` variant, icon, truncating span, hover title, `w-full` when tooltip-wrapped)
- Test: `registry/tests/table.test.tsx`, `registry/tests/button.test.tsx` (create)
- Regenerate: `registry/public/r/*.json`; sync: `samples/spfx-sample/src/components/speel/`
- Modify: `samples/spfx-sample/tests/layout/shadcnFixture.tsx`, `samples/spfx-sample/tests/layout/shadcnLayout.spec.ts`

**Interfaces:** consumes `TableColumn.align`, `ButtonProps.appearance: "link"`; `setOverflowTitle` from `@speel/react`.

- [ ] **Step 1: Failing registry tests**

`registry/tests/table.test.tsx`:

```tsx
it("aligns the header label box and the cells", () => {
  const { container } = render(
    <T
      columns={[
        { key: "n", header: "N", width: 80, align: "end", render: () => "42" },
      ]}
      items={items}
    />,
  );
  expect(container.querySelector("[data-header-label]")!.className).toContain(
    "text-end",
  );
  expect(container.querySelector("td")!.className).toContain("text-end");
});
```

`registry/tests/button.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { shadcnAdapter } from "@/speel-shadcn/adapter";

const B = shadcnAdapter.Button;
const sized = (el: HTMLElement, s: number, c: number): void => {
  Object.defineProperty(el, "scrollWidth", { value: s, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: c, configurable: true });
};

describe("shadcn Button appearance link", () => {
  it("renders the link variant, start-aligned, its label truncating", () => {
    const onClick = vi.fn();
    render(<B appearance="link" text="A long title" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "A long title" });
    expect(button.className).toContain("h-auto");
    expect(button.className).toContain("justify-start");
    expect(button.querySelector(".truncate")!.textContent).toBe("A long title");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("titles a cut-off link with its text on hover", () => {
    render(<B appearance="link" text="A long title" />);
    const label = screen
      .getByRole("button", { name: "A long title" })
      .querySelector<HTMLElement>(".truncate")!;
    sized(label, 200, 80);
    fireEvent.mouseEnter(label);
    expect(label.title).toBe("A long title");
  });
});

describe("shadcn Button tooltip anchoring", () => {
  it("lets a tooltip-wrapped button fill its trigger", () => {
    render(<B text="Submit" tooltip="Sends it" />);
    expect(screen.getByRole("button", { name: "Submit" }).className).toContain(
      "w-full",
    );
  });
});
```

(Adjust the hover target to wherever the implementation attaches `onMouseEnter` — the spec says the truncating span.)

- [ ] **Step 2: Failing shadcn layout scenarios** — mirror Task 2/3's scenarios in `shadcnFixture.tsx` (`align`, `link`, `tip-block`, `tip-column`, `tip-row`, using `shadcnAdapter`/`ShadButton` from the synced skin) and the corresponding tests in `shadcnLayout.spec.ts`: align-end header label and cell text end at the content edge (padding read from the page); a long link shows its first character inside the cell and is cut off with the full text on hover; a link row is no taller than a plain row; the tooltip trigger's box equals the button's box in all three containers.

- [ ] **Step 3: Run to verify they fail** — `npm run build -w @speel/react && npm --prefix registry test -- --run tests/table.test.tsx tests/button.test.tsx`; the shadcn layout tests after Step 4's sync will also be RED before Step 3's implementation — write them first and run the layout suite on the current skin.

- [ ] **Step 4: Implement**

`table.tsx`: `const ALIGN = { start: "text-start", center: "text-center", end: "text-end" } as const;` — add `c.align ? ALIGN[c.align] : undefined` to the header label box's `cn(...)` and to the `td`'s `cn(...)`.

`fields.tsx` `ShadButton`:

- `BUTTON_VARIANT` gains `link: "link"`.
- When `p.appearance === "link"`: `className={cn("h-auto max-w-full justify-start p-0 text-left", p.tooltip !== undefined && "w-full")}` and children `<>{icon}<span className="truncate" {...(p.tooltip === undefined ? { onMouseEnter: (e) => setOverflowTitle(e.currentTarget, () => p.text) } : {})}>{p.text}</span></>` where `icon` is the skin's icon for `p.iconName` (use the same icon lookup `ShadIconButton` uses), or nothing.
- Otherwise, when `p.tooltip !== undefined`, add `w-full` to the button's className.

- [ ] **Step 5: Registry gates, build, sync** — `npm --prefix registry run typecheck && npm --prefix registry test`; `npx prettier --write registry/src/speel-shadcn/table.tsx registry/src/speel-shadcn/fields.tsx registry/tests/*.tsx`; `npm --prefix registry run registry:build && npm run sync:skin && npm run check:skin`.

- [ ] **Step 6: Layout + sample build** — `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout` (all PASS) and `npm --prefix samples/spfx-sample run build:check`.

- [ ] **Step 7: Commit** — `feat(registry): shadcn column align, link button, tooltip host anchoring (#70 #58)` (add registry source/tests/public/r, synced sample files, layout tests; trailers).

---

### Task 5: Docs, changeset, gate

**Files:** `packages/speel-react/docs/table-columns.md`, `packages/speel-react/docs/skins.md`, any docs page listing `ButtonProps.appearance` values (grep `appearance` in `packages/speel-react/docs/`), `.changeset/table-columns.md`.

- [ ] **Step 1:** `table-columns.md` — Capabilities gains `align` (start/center/end, header and cells; numbers stay start unless the column says end) and the idiom "a cell that opens its row": `render: (t) => <ui.Button appearance="link" text={t.Title ?? ""} onClick={() => open(t)} />` (with `const ui = useSpeelUI()`), noting the link truncates at its end and shows its full text on hover. The page is at 250 lines: tighten existing prose to stay ≤ 250 with four H2s. Re-verify identifiers against `src/index.ts`.
- [ ] **Step 2:** `skins.md` — the adapter contract mentions `TableColumn.align` and the `"link"` appearance (a skin renders it as an inline, end-truncating text button) and the tooltip-host rule (the host and the button are one box). ≤ 250 lines.
- [ ] **Step 3:** Where docs list button appearances, add `"link"`.
- [ ] **Step 4:** Changeset — append: "Columns take `align` (`start` / `center` / `end`) for header and cells. Buttons take `appearance: \"link\"`: an inline text button that truncates at its end and shows its full text on hover — the way to make a table cell open its row. A button's tooltip now anchors to the button in any container (#58)."
- [ ] **Step 5:** `npm run format:check && npm run verify` (10-minute timeout) green.
- [ ] **Step 6:** Commit `docs: column align, link buttons, tooltip anchoring; changeset` with the trailers.
