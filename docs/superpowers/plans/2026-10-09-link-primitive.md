# `ui.Link` Primitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreleased `ButtonProps.appearance: "link"` with a `Link` adapter primitive that mirrors Fluent's `Link` (`href` → `<a>`, else `<button>`; SPA click override) and looks identical to a real link in each skin; adopt it in core's document form and the sample.

**Architecture:** A new `SpeelUIAdapter.Link` member (`LinkProps`) implemented by the v8 skin (Fluent `Link`), the registry shadcn skin (one class set on `<a>` and `<button>`), and the test fake adapter. The link-button code from the previous cycle is removed; its truncation/hover-title behaviour moves to `Link`.

**Tech Stack:** TypeScript 5.4 (strict, `exactOptionalPropertyTypes`), React 17, Fluent UI v8 8.125 (`Link`), shadcn/Tailwind v4 (registry + synced sample copy), vitest + Testing Library, Playwright layout project (both skins).

**Spec:** `docs/superpowers/specs/2026-10-09-link-primitive-design.md`

## Global Constraints

- **Worktree:** every command runs in `/home/peter/source/repos/backlundpf/speel/.claude/worktrees/table-columns` (branch `feat/table-columns-57-62-67`, PR #68). Start every Bash session with `cd /home/peter/source/repos/backlundpf/speel/.claude/worktrees/table-columns && pwd`; absolute paths under it. Never touch the main checkout or another worktree. Never push. **Never start the SPFx dev server** (`npm run dev` / `heft start`) — the user does the live test.
- **Public repo:** no consumer names anywhere.
- **Node ESM:** relative imports in `packages/` carry `.js`. **`exactOptionalPropertyTypes`:** conditional spreads.
- **Skins:** new adapter members go into v8, the test `fakeAdapter`, and the registry shadcn skin (author in `registry/src/speel-shadcn/`, then `npm --prefix registry run registry:build` + `npm run sync:skin` + `npm run check:skin`; never hand-edit `samples/spfx-sample/src/components/speel/`).
- **Builds:** `npm run build -w @speel/react` before registry tests/typecheck, the sample build, or `npm --prefix samples/spfx-sample run test:layout`.
- **Formatting:** `npx prettier --write <changed files>` before each commit; npm installs use `--cache "$TMPDIR/npm-cache"`.
- **Commits** end with exactly:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RrcErgWCj65JbRrynrTGwi
  ```
- **`LinkProps` (exact):** `{ text: string; href?: string; onClick?: () => void; target?: string; ariaLabel?: string; disabled?: boolean }`.
- **SPA click rule (exact):** with `href` and `onClick`: a click with `button === 0` and none of `ctrlKey`/`metaKey`/`shiftKey`/`altKey` → `preventDefault()` then `onClick()`; any other click → untouched (no `onClick`). Without `href`: `onClick()`. Disabled: never `onClick`, never navigates, `aria-disabled="true"`, still focusable.
- **`target="_blank"`** → `rel="noreferrer noopener"`.
- **Truncation (exact):** `display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: top; text-align: start`; on `mouseenter`, `setOverflowTitle(el, () => text)`.
- **shadcn link classes (exact core):** `text-primary font-normal underline-offset-4 hover:underline` + the truncation (`inline-block max-w-full truncate align-top text-start`) + `cursor-pointer` + a focus-visible ring + `aria-disabled:` muted; the SAME class string on `<a>` and `<button>`.
- **Removed:** `"link"` from `ButtonProps.appearance` and every link-button implementation, test, layout scenario and doc line. The #58 tooltip anchoring for ordinary buttons stays.

## Review Focus

- **Keyboard:** Enter on a focused `<a>` with `onClick` must run `onClick` (not navigate); Tab order unchanged. Pinned in Task 1 jsdom (`fireEvent.click` with `detail: 0` = keyboard).
- **Middle click** must not run `onClick` (browsers fire `auxclick`, not `click`, but a synthetic `click` with `button: 1` must also be ignored). Pinned in Task 1/2 tests.
- **A disabled `href` link** must not navigate — v8 Fluent `Link` and shadcn must both drop or block navigation. Pinned in Task 1/2 tests (`defaultPrevented` on click, or no `href` attribute).
- **The `<a>` and `<button>` forms look identical at rest and on hover** (colour, weight, decoration, cursor). Pinned in the layout tests.
- **Removing the link appearance must leave ordinary buttons' tooltip anchoring intact** (the #58 tests keep passing).

---

### Task 1: Core + v8 — `Link` primitive, remove the link appearance

**Files:**

- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`LinkProps`, `SpeelUIAdapter.Link`, `ButtonProps.appearance` without `"link"`)
- Modify: `packages/speel-react/src/index.ts` (export `LinkProps`)
- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (add `V8Link`; remove `V8LinkButton`, `LINK_TOOLTIP_HOST_STYLES`, `FocusableButton` if unused, the link branch in `V8Button`; keep `LINK_STYLES` for `V8Link`)
- Modify: `packages/speel-react/src/fluent-v8/index.ts` (adapter `Link: V8Link`)
- Modify: `packages/speel-react/src/form/documentFormParts.tsx` (file link → `ui.Link`)
- Modify: `packages/speel-react/test/fakeAdapter.tsx` (`Link`)
- Test: `packages/speel-react/test/v8Link.test.tsx` (create); `packages/speel-react/test/v8Button.test.tsx` (drop the link tests, keep anchoring); the document-form test that covers the file link (grep `FileLeafRef` in `test/`) asserts it renders through the adapter's `Link`.
- Modify: `samples/spfx-sample/tests/layout/fixture.tsx`, `tableLayout.spec.ts` (replace the v8 link-button scenarios)

- [ ] **Step 1: Failing v8 tests** — `v8Link.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { V8Link } from "../src/fluent-v8/primitives.js";

const sized = (el: HTMLElement, s: number, c: number): void => {
  Object.defineProperty(el, "scrollWidth", { value: s, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: c, configurable: true });
};
/** fireEvent.click returns false when the handler called preventDefault. */
const clickPrevented = (el: HTMLElement, init: MouseEventInit = {}): boolean =>
  !fireEvent.click(el, { button: 0, ...init });

describe("V8Link", () => {
  it("renders a real anchor for href, a button without one", () => {
    const { rerender } = render(<V8Link text="Spec" href="/spec" />);
    const a = screen.getByRole("link", { name: "Spec" });
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("/spec");
    expect(a.className).toContain("ms-Link");
    rerender(<V8Link text="Spec" onClick={() => undefined} />);
    expect(screen.getByRole("button", { name: "Spec" }).className).toContain(
      "ms-Link",
    );
  });

  it("captures a plain click for onClick and leaves modified clicks to the browser", () => {
    const onClick = vi.fn();
    render(<V8Link text="Spec" href="/spec" onClick={onClick} />);
    const a = screen.getByRole("link", { name: "Spec" });
    expect(clickPrevented(a)).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
    for (const mod of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ]) {
      expect(clickPrevented(a, mod)).toBe(false);
    }
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("runs onClick for a keyboard activation", () => {
    const onClick = vi.fn();
    render(<V8Link text="Spec" href="/spec" onClick={onClick} />);
    expect(
      clickPrevented(screen.getByRole("link", { name: "Spec" }), { detail: 0 }),
    ).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("opens a new tab safely", () => {
    render(<V8Link text="Spec" href="/spec" target="_blank" />);
    expect(screen.getByRole("link", { name: "Spec" }).getAttribute("rel")).toBe(
      "noreferrer noopener",
    );
  });

  it("disabled: aria-disabled, no onClick, no navigation", () => {
    const onClick = vi.fn();
    render(<V8Link text="Spec" href="/spec" onClick={onClick} disabled />);
    const el = screen.getByText("Spec").closest(".ms-Link") as HTMLElement;
    expect(el.getAttribute("aria-disabled")).toBe("true");
    const prevented = clickPrevented(el);
    expect(onClick).not.toHaveBeenCalled();
    expect(prevented || !el.hasAttribute("href")).toBe(true);
  });

  it("truncates at the end and titles itself when cut off", () => {
    render(<V8Link text="A long title" href="/x" />);
    const a = screen.getByRole("link", { name: "A long title" });
    const cs = getComputedStyle(a);
    expect([
      cs.display,
      cs.overflow,
      cs.textOverflow,
      cs.whiteSpace,
      cs.maxWidth,
    ]).toEqual(["inline-block", "hidden", "ellipsis", "nowrap", "100%"]);
    sized(a, 200, 80);
    fireEvent.mouseEnter(a);
    expect(a.title).toBe("A long title");
  });
});
```

In `v8Button.test.tsx` delete the `describe("V8Button appearance link", …)` block (keep the tooltip-anchoring tests).

- [ ] **Step 2: Run to verify they fail** — `npx vitest --run test/v8Link.test.tsx` (from `packages/speel-react`): FAIL (`V8Link` not exported).

- [ ] **Step 3: Implement**

`SpeelUIAdapter.ts`:

```ts
/**
 * A link — identical to a real link in the skin, whichever form it takes. With `href` it is an
 * `<a>` (open in new tab, copy link and middle click work); `onClick` then replaces navigation on a
 * plain left click only, so an SPA can update the page while a modified click still opens a tab.
 * Without `href` it is a `<button>` that looks the same.
 */
export interface LinkProps {
  text: string;
  href?: string;
  onClick?: () => void;
  /** `_blank` adds `rel="noreferrer noopener"`. */
  target?: string;
  ariaLabel?: string;
  disabled?: boolean;
}
```

and `Link: ComponentType<LinkProps>;` in `SpeelUIAdapter` (after `IconButton`); `ButtonProps.appearance` back to `"primary" | "secondary" | "subtle" | "danger"` (drop the link sentence from its comment). Export `LinkProps` from `index.ts`.

`primitives.tsx` — `V8Link` (reuse `LINK_STYLES`):

```tsx
/** Whether a click on a link should be left to the browser — a new tab, window or download. */
const browserHandlesClick = (e: React.MouseEvent): boolean =>
  e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;

export function V8Link(p: LinkProps): JSX.Element {
  const { onClick, href } = p;
  return (
    <Link
      styles={LINK_STYLES}
      {...(href !== undefined ? { href } : {})}
      {...(p.target !== undefined
        ? {
            target: p.target,
            ...(p.target === "_blank" ? { rel: "noreferrer noopener" } : {}),
          }
        : {})}
      disabled={!!p.disabled}
      {...(p.ariaLabel !== undefined ? { "aria-label": p.ariaLabel } : {})}
      {...(onClick
        ? {
            onClick: (e: React.MouseEvent<HTMLElement>) => {
              if (href !== undefined) {
                if (browserHandlesClick(e)) return;
                e.preventDefault();
              }
              onClick();
            },
          }
        : {})}
      onMouseEnter={(e: React.MouseEvent<HTMLElement>) =>
        setOverflowTitle(e.currentTarget, () => p.text)
      }
    >
      {p.text}
    </Link>
  );
}
```

(Fluent's `Link` already prevents default and skips `onClick` when disabled — verify against `node_modules/@fluentui/react/lib-commonjs/components/Link/useLink.js`; if a disabled `href` link would still navigate, prevent it.) Remove `V8LinkButton`, the link branch in `V8Button`, `LINK_TOOLTIP_HOST_STYLES` (the tooltip host goes back to `TOOLTIP_HOST_STYLES` for every button), and `FocusableButton` if nothing else uses it. Keep `FILL_HOST`/`TOOLTIP_HOST_STYLES` (#58).

`fluent-v8/index.ts`: `Link: V8Link,` in the adapter (and export `V8Link` alongside the other primitives if they are exported there).

`documentFormParts.tsx`: replace `<a href={entity.FileRef}>{entity.FileLeafRef}</a>` with `<ui.Link href={entity.FileRef} text={entity.FileLeafRef} />`.

`fakeAdapter.tsx`:

```tsx
  Link: ({ text, href, onClick, target, ariaLabel, disabled }) =>
    href !== undefined ? (
      <a
        href={href}
        target={target}
        aria-label={ariaLabel}
        aria-disabled={disabled ? "true" : undefined}
        data-fake-link=""
        onClick={(e) => {
          if (disabled) return e.preventDefault();
          if (!onClick || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onClick();
        }}
      >
        {text}
      </a>
    ) : (
      <button type="button" data-fake-link="" aria-label={ariaLabel} aria-disabled={disabled ? "true" : undefined}
        onClick={() => { if (!disabled) onClick?.(); }}>
        {text}
      </button>
    ),
```

- [ ] **Step 4: Document form test** — in the existing document-form test that renders a file (grep `FileLeafRef` in `packages/speel-react/test/`), assert the file name renders inside `[data-fake-link]` with the `FileRef` href. Run it RED first if adding.

- [ ] **Step 5: v8 layout scenarios** — in `fixture.tsx` replace the link-button table scenario (`"link"`, incl. the "Tipped" column) with a `"link"` scenario using `fluentV8Adapter.Link`: column `t` renders `<V8Link href={"#" + (r as Row)["t"]} text={(r as Row)["t"] ?? ""} onClick={() => undefined} />`, a column `b` renders `<V8Link text="Action" onClick={() => undefined} />` (button form), plus `p` (plain) and filler; items: a long title and a short one. In `tableLayout.spec.ts` replace the link-button tests with:
  - the long `<a>` link shows its first character inside the cell, is cut off, and hovers its full text;
  - a link row is no taller than a plain-text row;
  - the `<a>` (column t, short row) and the `<button>` (column b) have identical computed `color`, `font-weight`, `text-decoration-line`, `cursor` at rest, and identical `text-decoration-line` while hovered.
    Keep the `tip-*` anchoring tests (they use ordinary buttons).

- [ ] **Step 6: Run** — `npm test -w @speel/react`; `npm run build -w @speel/react && npm --prefix samples/spfx-sample run test:layout` (v8 tests must pass; shadcn layout tests that use the removed link variant may fail until Task 2 — note which).

- [ ] **Step 7: Commit** — `feat(react): ui.Link primitive — real anchor with SPA click override; v8 via Fluent Link; drop the link button appearance` (prettier; explicit file list; trailers).

---

### Task 2: shadcn — `ShadLink`, remove the link appearance

**Files:** `registry/src/speel-shadcn/fields.tsx` (add `ShadLink`; remove the link branch from `ShadButton` and `BUTTON_VARIANT.link`), `registry/src/speel-shadcn/adapter.tsx` (`Link: ShadLink`), `registry/tests/button.test.tsx` (drop link tests), `registry/tests/link.test.tsx` (create), `registry/tests/adapter.smoke.test.tsx` (member list now includes `"Link"`, count 23), regenerated `registry/public/r/*.json`, synced sample copies, `samples/spfx-sample/tests/layout/shadcnFixture.tsx`, `shadcnLayout.spec.ts`.

- [ ] **Step 1: Failing registry tests** — `link.test.tsx` mirrors Task 1's `v8Link` tests for `shadcnAdapter.Link` (anchor vs button; plain click prevented + `onClick`; modified/middle clicks untouched; keyboard `detail: 0`; `_blank` rel; disabled = `aria-disabled`, no `onClick`, no navigation; cut-off hover title), plus: the `<a>` and the `<button>` forms carry the identical `className`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** — in `fields.tsx`:

```tsx
/** One look for both link forms — an `<a>` and a `<button>` must be indistinguishable. */
const LINK_CLASSES =
  "text-primary inline-block max-w-full truncate align-top text-start font-normal underline-offset-4 hover:underline cursor-pointer rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:text-muted-foreground aria-disabled:no-underline";
```

`ShadLink(p: LinkProps)`: with `href` → `<a className={LINK_CLASSES} href={p.disabled ? undefined : p.href} …>` (a disabled anchor drops `href` and keeps `tabIndex={0}` + `aria-disabled`), the same click rule as v8 (`browserHandlesClick`), `target`/`rel`; without `href` → `<button type="button" className={LINK_CLASSES} aria-disabled …>`; both get `onMouseEnter={(e) => setOverflowTitle(e.currentTarget, () => p.text)}`. Remove `BUTTON_VARIANT.link` and the link branch of `ShadButton`; keep its `w-full` tooltip anchoring for ordinary buttons. Adapter: `Link: ShadLink`.

- [ ] **Step 4: Registry gates, build, sync** — `npm run build -w @speel/react && npm --prefix registry run typecheck && npm --prefix registry test`; prettier; `npm --prefix registry run registry:build && npm run sync:skin && npm run check:skin`.
- [ ] **Step 5: shadcn layout** — replace the shadcn link-button scenarios with the same `"link"` scenario as Task 1 (using `ShadLink` from the synced `@/components/speel/fields`), and the same three tests (first char visible + cut off + hover title; row height; `<a>` vs `<button>` identical computed style at rest and hovered). Run `npm --prefix samples/spfx-sample run test:layout` — all PASS (both skins).
- [ ] **Step 6: Commit** — `feat(registry): shadcn Link — identical anchor and button forms, underline on hover; drop the link button variant`.

---

### Task 3: Sample adoption

**Files:** `samples/spfx-sample/src/webparts/projectDashboard/components/ArtifactsPanel.tsx`, `samples/spfx-sample/src/webparts/projectDashboard/components/ProjectsDashboard.tsx`

- [ ] **Step 1:** `ArtifactsPanel.tsx` File column: replace the raw `<a href target rel>` (and its "no link primitive" comment) with `<ui.Link href={r.FileRef} text={r.FileLeafRef} target="_blank" />` (get `ui` via `useSpeelUI()` in that component if it isn't already).
- [ ] **Step 2:** `ProjectsDashboard.tsx`:
  - `useUrlState` gains `project: urlNumber()` next to `skin` (import `urlNumber` from `@speel/react`); expose the URL values/setter to `DashboardBody` (props or context, matching how `skin` flows today).
  - A helper `projectHref(id)`: the current `window.location.href` with the `project` search parameter set to `id` (`new URL(...)`, `searchParams.set`), as a string.
  - The Title column renders `<ui.Link href={projectHref(idOf(r))} text={r.Title ?? ""} onClick={() => openProject(r)} />`, where `openProject` sets `project` in the URL state and opens the view (`viewProject`), clearing `project` again when the view closes (`showForm` resolves on close).
  - When the dashboard loads with `project` set, it loads that project (`ctx.set(Project)` query by `Id`, the same style the dashboard already uses to load entities) and opens its view once; a missing id just clears the parameter.
  - Update the dashboard's column comment (the title "opens the project; open it in a new tab with the link's own menu").
- [ ] **Step 3: Build** — `npm run build -w @speel/react && npm --prefix samples/spfx-sample run build:check` (exit 0, no new lint warnings on changed lines). Do NOT run the dev server.
- [ ] **Step 4: Commit** — `feat(sample): links via ui.Link — file links, and project titles that open in place or in a new tab`.

---

### Task 4: Docs, changeset, gate

- [ ] **Step 1:** `docs/table-columns.md`: "A cell that opens its row" uses `ui.Link` with `href` + `onClick` (a plain click opens in place; open-in-new-tab still works via the real `href`); remove any `appearance: "link"` text. ≤ 250 lines, four H2s; re-verify identifiers against `src/index.ts`.
- [ ] **Step 2:** `docs/skins.md`: the adapter contract gains `Link` (anchor and action forms identical; the SPA click rule) and loses the link appearance. ≤ 250 lines.
- [ ] **Step 3:** grep `packages/speel-react/docs/` and `README.md` for `appearance` / `"link"` and fix stragglers; list `Link` wherever adapter members are enumerated.
- [ ] **Step 4:** `.changeset/table-columns.md`: replace the `appearance: "link"` sentence with: "`ui.Link` (a new adapter member): a real link that looks like the skin's links in both its forms — `href` renders an anchor (open in new tab works) and `onClick` replaces navigation on a plain click only; without `href` it is a button that looks the same. Long links truncate at their end and show their full text on hover." Keep the skin-author sentence accurate (`Link` member; no `"link"` appearance).
- [ ] **Step 5:** `npm run format:check && npm run verify` (10-minute timeout) green.
- [ ] **Step 6:** Commit `docs: ui.Link; changeset`.
