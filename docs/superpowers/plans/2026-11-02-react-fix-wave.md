# @speel/react fix wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #99, #100, #96, #97 (+ #83's naming part), #87, #81, #82, #92 and #79 in `@speel/react` and both skins.

**Architecture:** Contract changes land in `SpeelUIAdapter.ts` / `surfaceProps.ts` / `SpeelTable.tsx` / `columns.ts`; each is implemented in the fluent-v8 skin (`src/fluent-v8/primitives.tsx`), the shadcn registry skin (`registry/src/speel-shadcn/*`, then synced into the sample), and `test/fakeAdapter.tsx`. Cycle 1 = surfaces and fields (Tasks 1–8), cycle 2 = table (Tasks 9–12), then live checks and the branch's docs/changeset (Tasks 13–14).

**Tech Stack:** React 17, TypeScript (exactOptionalPropertyTypes), Fluent UI v8, Radix/shadcn, Vitest + Testing Library, Playwright (SPFx sample).

**Spec:** `docs/superpowers/specs/2026-11-02-react-fix-wave-design.md`

## Global Constraints

- Branch `fix/react-wave`; every commit on it; no push until Task 14.
- Public repo: no consumer app, org, tenant or account names in code, tests, docs, commits. Use `contoso` / generic shapes.
- Relative imports carry `.js`.
- Optional props are added spread-if-defined (`...(x !== undefined ? { x } : {})`) for `exactOptionalPropertyTypes`.
- Any `SpeelUIAdapter` prop change is implemented in v8, the shadcn registry skin and `fakeAdapter`.
- shadcn: edit `registry/src/speel-shadcn/*` only, then `npm run sync:skin` (never hand-edit the sample copy) and `npm --prefix registry run registry:build` (commit `registry/public/r`).
- Commands below run from the repo root unless they say `in packages/speel-react:`. Test command there: `npx vitest run <file>`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A view-mode field named inline (`ariaLabel`, no label — a table cell) that has a description**: no info icon (there is no label row to sit by and a cell icon is noise); the text is still the display's accessible description. → Task 2 test `inline-named display: no icon, still described`.
2. **An edit-mode field that is required, has an error and a description**: `aria-describedby` carries both the error id and the description id. → Task 1 test `describedby carries error and description`.
3. **A disabled menu item with a tooltip**: reachable by arrow keys, tooltip shows on focus, Enter/click does not fire `onClick`. → Task 7 test `disabled item: focusable, tooltip on focus, no click`.
4. **`rowActions.available` hides every action on a row**: the cell renders empty, the actions column keeps its width on every row. → Task 10 test `all actions hidden on a row keeps column width`.
5. **A surface with both `title` and `ariaLabel`**: named by the title; `ariaLabel` ignored. → Task 5 test `title wins over ariaLabel`.

---

## Cycle 1 — surfaces and fields

### Task 1: Field help text reaches every edit-mode input (#99)

**Files:**

- Modify: `packages/speel-react/src/form/FieldHandle.ts`, `src/form/useField.ts`, `src/form/useStandaloneField.ts`, `src/fields/SpeelField.tsx` (`chromeOf`), `src/fields/ShapeFieldRow.tsx`
- Modify: `packages/speel-react/test/fakeAdapter.tsx` (fake inputs render `description` with an id and wire `aria-describedby`, if they don't already)
- Test: `packages/speel-react/test/SpeelField.description.test.tsx` (new)

**Interfaces:**

- Produces: `FieldHandle.description?: string` (readonly); `StandaloneFieldOptions.description?: string`; `chromeOf(field)` sets `description` when defined.
- Source: `et.findProperty(name)?.description` / `INavigation.description` (both exist in core).

- [ ] **Step 1: Write the failing tests** (fakeAdapter + a model with `description` on a Text, Number, Choice, Boolean and a ManyToOne field, rendered through `SpeelForm` in edit mode):
  - `renders each property's description under its input` — `screen.getByText("<desc>")` for each.
  - `the input is described by it` — `expect(input.getAttribute("aria-describedby")).toContain(descEl.id)`.
  - `describedby carries error and description` — required Text, touched empty → `aria-describedby` contains both the error element's id and the description's id.
  - `standalone field forwards description` — `useStandaloneField({ …, description: "Hint" })` + `<SpeelField field={…}/>` renders `"Hint"`.
  - `shape rows show their property descriptions` — a Json shape whose property has a description renders it.
- [ ] **Step 2:** in packages/speel-react: `npx vitest run test/SpeelField.description.test.tsx` → FAIL (text not found).
- [ ] **Step 3:** Add the `description` member/option; copy in `useField` (`field.description`) and `useStandaloneField` (`opts.description`); `ShapeFieldRow` passes `property.description`; `chromeOf` sets `c.description`. Extend the fake inputs if needed.
- [ ] **Step 4:** Re-run → PASS. Also `npx vitest run test/fakeAdapter.test.tsx` still passes.
- [ ] **Step 5: Commit** `fix(react): carry a property's description to its field (#99)`

### Task 2: Description as an info icon in displays, v8 (#99)

**Files:**

- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`FieldDisplayProps`)
- Modify: `packages/speel-react/src/fields/SpeelField.tsx` (branches 1, 3 and `renderInput`'s `default`), `src/fields/JsonFieldBody.tsx`
- Modify: `packages/speel-react/src/fluent-v8/Field.tsx` (`V8Field` gains the icon variant), `src/fluent-v8/primitives.tsx` (`V8FieldDisplay`)
- Modify: `packages/speel-react/test/fakeAdapter.tsx` (`FieldDisplay` honours `descriptionAs`)
- Test: `packages/speel-react/test/fluentV8.fieldDisplay.test.tsx` (new); extend `test/SpeelField.description.test.tsx`

**Interfaces:**

- Consumes: Task 1's `chromeOf` description.
- Produces: `FieldDisplayProps.descriptionAs?: "text" | "icon"` — default `"icon"`. SpeelField passes `"text"` for the render-override branch when `field.mode !== "view" && !field.readOnly`, for `renderInput`'s `default` branch, and JsonFieldBody passes `"text"` in edit mode / `"icon"` in view or read-only. Branch 3 (view/read-only display) passes the description with the default.

- [ ] **Step 1: Write the failing tests** in `fluentV8.fieldDisplay.test.tsx`:
  - `icon variant: no subtext, focusable info button described by the text` — `render(<V8FieldDisplay label="Donor" description="Who gave it">x</V8FieldDisplay>)`; `queryByText("Who gave it")` is not in the document before interaction; `getByRole("button", { name: "More information about Donor" })` exists and is tabbable; the group (`getByRole("group", { name: "Donor" })`) has `aria-describedby` resolving to an element whose text is `"Who gave it"` (hidden text element is fine).
  - `icon variant: tooltip shows on focus` — focus the info button → `await screen.findByText("Who gave it")` visible in the tooltip.
  - `text variant: subtext as before` — `descriptionAs="text"` → `getByText("Who gave it")` and no info button.
  - `inline-named display: no icon, still described` — `ariaLabel="Donor"` (no `label`) + description → no info button; group still has `aria-describedby` to the text.
  - In `SpeelField.description.test.tsx`: `view mode shows the icon, not the text` and `read-only field shows the icon` (fakeAdapter renders a marker for `descriptionAs`).
- [ ] **Step 2:** in packages/speel-react: `npx vitest run test/fluentV8.fieldDisplay.test.tsx test/SpeelField.description.test.tsx` → FAIL.
- [ ] **Step 3:** Implement. v8: icon = Fluent `IconButton`/`Icon` `Info` inside a `TooltipHost` (reuse the `useStableId` + TooltipHost pattern of `V8Button`, `primitives.tsx:291-310`) placed in the label row after `Label`; the description text is kept in a visually-hidden element with `aria.descriptionId` so `aria-describedby` still resolves. `V8Field` takes `descriptionAs` (default `"text"` for inputs — inputs never pass it); `V8FieldDisplay` passes `p.descriptionAs ?? "icon"`.
- [ ] **Step 4:** Re-run → PASS; `npx vitest run test/fluentV8.labels.test.tsx test/v8FieldNames.test.tsx` still PASS.
- [ ] **Step 5: Commit** `feat(react): show a display's description behind an info icon (#99)`

### Task 3: Info icon in the shadcn skin (#99)

**Files:**

- Modify: `registry/src/speel-shadcn/chrome.tsx` (the shared `Chrome` / FieldDisplay path) — and `fields.tsx` if FieldDisplay lives there
- Test: `registry/tests/field-description.test.tsx` (new)
- Sync: `samples/spfx-sample/src/**` via `npm run sync:skin`; `registry/public/r` via `registry:build`

**Interfaces:**

- Consumes: `FieldDisplayProps.descriptionAs` (Task 2).

- [ ] **Step 1: Write the failing tests** mirroring Task 2's four v8 tests against the shadcn adapter (Radix `Tooltip` content appears on focus of the info trigger; inputs still show text).
- [ ] **Step 2:** `npm --prefix registry test -- tests/field-description.test.tsx` → FAIL.
- [ ] **Step 3:** Implement with the registry's existing `Tooltip`/`TooltipTrigger`/`TooltipContent` (as `fields.tsx:274-300` does for Button) and a lucide `Info` icon in a `button type="button"` named `More information about <label>` (same name as v8).
- [ ] **Step 4:** Re-run → PASS; then `npm run sync:skin && npm --prefix registry run registry:build && npm run check:skin && npm --prefix registry run typecheck`.
- [ ] **Step 5: Commit** `feat(shadcn): info-icon descriptions on field displays (#99)` (include `registry/public/r` and the synced sample files).

### Task 4: v8 NumberInput owns its label (#100)

**Files:**

- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (`V8NumberInput`, ~:191-231)
- Test: `packages/speel-react/test/fluentV8.numberInput.test.tsx` (new)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests:**
  - `required number field marks its label required` — `render(<V8NumberInput label="Amount" required value={1} onChange={noop}/>)`; the `<label>` is the Fluent `Label` rendered by `V8Field` (assert `container.querySelectorAll("label").length === 1` and the label's `htmlFor` equals the spinbutton input's `id`), and `getByRole("spinbutton", { name: "Amount" })` resolves, and has `aria-required="true"` (as `fluentV8.labels.test.tsx:193` asserts for dates). The visible asterisk is checked live in Task 13 (jsdom can't see Fluent's `::after`).
  - `label sits before the currency prefix` — with `prefix="USD"`: `label.compareDocumentPosition(getByText("USD")) & Node.DOCUMENT_POSITION_FOLLOWING` is truthy; the label is not inside the adornment flex row.
  - `suffix and error still render` — `suffix="%"`, `error="Too big"` → both in the document; the input's `aria-describedby` contains the error id.
- [ ] **Step 2:** in packages/speel-react: `npx vitest run test/fluentV8.numberInput.test.tsx` → FAIL.
- [ ] **Step 3:** `V8Field` with default `renderLabel` (true); `SpinButton` gets no `label`; name the input via `inputProps: { id: aria.controlId, "aria-labelledby": aria.labelId, "aria-required": … }` when labelled (keep `ariaLabel` for the inline-named case), merging with the existing `placeholder` `inputProps`.
- [ ] **Step 4:** Re-run → PASS; `npx vitest run test/fluentV8.labels.test.tsx test/v8FieldNames.test.tsx` PASS.
- [ ] **Step 5: Commit** `fix(react): v8 number inputs show the required marker and label above (#100)`

### Task 5: Surfaces are named; panel close button is named (v8 + contract) (#96, #97)

**Files:**

- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`DialogProps`), `src/surface/surfaceProps.ts` (`SurfaceChromeProps`), every place surface chrome is forwarded to `ui.Dialog` / `ui.Drawer` (`SpeelModal`, `SpeelPanel`, `SurfaceForm`, `useSurfaces` — grep `fullscreenToggle` to find the forwarding sites)
- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (`V8Dialog` ~:547, `V8Panel` ~:1481)
- Modify: `packages/speel-react/test/fakeAdapter.tsx` (Dialog/Drawer: `role="dialog"` named by title, else `ariaLabel`)
- Test: `packages/speel-react/test/fluentV8.surfaceNames.test.tsx` (new); extend `test/surfaceChrome.test.tsx` for forwarding

**Interfaces:**

- Produces: `DialogProps.ariaLabel?: string` (DrawerProps inherits); `SurfaceChromeProps.ariaLabel?: string`.

- [ ] **Step 1: Write the failing tests:**
  - `modal is named by its title` — `V8Dialog open title="History"` → `getByRole("dialog", { name: "History" })`.
  - `untitled modal is named by ariaLabel` — `ariaLabel="History"`, no title → same query passes.
  - `title wins over ariaLabel` — both given → name is the title.
  - `unnamed modal warns once in development` — neither → `console.warn` called once mentioning `ariaLabel`; re-render does not warn again.
  - `panel is named by title / ariaLabel` — same two for `V8Panel`.
  - `panel close button is named` — `V8Panel open` (not blocking) → `getByRole("button", { name: "Close" })`.
  - `blocking panel has no close button` — unchanged behaviour.
  - In `surfaceChrome.test.tsx`: `SpeelModal/SpeelPanel/SurfaceForm forward ariaLabel` (fakeAdapter).
- [ ] **Step 2:** in packages/speel-react: `npx vitest run test/fluentV8.surfaceNames.test.tsx test/surfaceChrome.test.tsx` → FAIL.
- [ ] **Step 3:** v8 Dialog: title `<span id={titleId}>` (`useStableId`), `titleAriaId={p.title !== undefined ? titleId : undefined}`; with no title and an `ariaLabel`, pass it via the Modal's root `aria-label` (verify where Fluent puts `role="dialog"` and target that element). Panel: `closeButtonAriaLabel="Close"`; untitled → `aria-label` on the panel's dialog element (Fluent names a titled Panel from `headerText` itself — verify). Dev warning: `process.env.NODE_ENV !== "production"`, once per component instance (`useRef` flag).
- [ ] **Step 4:** Re-run → PASS; `npx vitest run test/surfaceReturnFocus.test.tsx test/SpeelSurface.test.tsx` PASS.
- [ ] **Step 5: Commit** `fix(react): name every modal and panel, and the panel's close button (#96, #97)`

### Task 6: Surface naming in the shadcn skin (#97)

**Files:**

- Modify: `registry/src/speel-shadcn/overlays.tsx` (`ShadDialog` ~:115, `ShadDrawer` ~:250)
- Test: `registry/tests/overlays-names.test.tsx` (new)

- [ ] **Step 1: Write the failing tests:** `titled dialog/sheet named by title`; `untitled with ariaLabel is named by it`; `title wins over ariaLabel`; `no empty DialogTitle rendered when untitled` (and Radix logs no missing-title `console.error` — spy on it); `unnamed warns once` (same contract as Task 5); `close buttons named "Close"` (already true — keep as regression).
- [ ] **Step 2:** `npm --prefix registry test -- tests/overlays-names.test.tsx` → FAIL.
- [ ] **Step 3:** Untitled: render the Radix title visually hidden carrying `ariaLabel` (so Radix's accessibility check is satisfied and the name is right); neither → no title element, `aria-label` absent, dev warning.
- [ ] **Step 4:** Re-run → PASS; `npm --prefix registry test -- tests/overlays-focus.test.tsx` PASS; `npm run sync:skin && npm --prefix registry run registry:build && npm run check:skin`.
- [ ] **Step 5: Commit** `fix(shadcn): name untitled dialogs and sheets by ariaLabel (#97)`

### Task 7: `MenuItem.tooltip` — contract, v8, fake (#87)

**Files:**

- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`MenuItem` ~:290)
- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (`V8Menu` ~:1435)
- Modify: `packages/speel-react/test/fakeAdapter.tsx` (`Menu` renders `title` + `aria-description` for the tooltip)
- Test: `packages/speel-react/test/fluentV8.menuTooltip.test.tsx` (new)

**Interfaces:**

- Produces: `MenuItem.tooltip?: string` — doc comment states the `Button.tooltip` contract: shown on hover **and** keyboard focus, Escape dismisses, the item's accessible description, present while `disabled`; a disabled item with a tooltip stays focusable.

- [ ] **Step 1: Write the failing tests** (open the menu, items with/without tooltip):
  - `item is described by its tooltip` — `getByRole("menuitem", { name: "Resend" })` has an accessible description equal to the tooltip text (`aria-describedby` → text, or `aria-description`).
  - `tooltip shows on keyboard focus` — arrow to the item → `await findByText(tooltip)` visible.
  - `tooltip shows on hover` — `userEvent.hover(item)` → visible.
  - `disabled item: focusable, tooltip on focus, no click` — disabled + tooltip: arrow key reaches it (`document.activeElement` is the item), tooltip visible, Enter and click don't call `onClick`, `aria-disabled="true"`.
  - `items without a tooltip are unchanged` — no description, no TooltipHost wrapper.
- [ ] **Step 2:** in packages/speel-react: `npx vitest run test/fluentV8.menuTooltip.test.tsx` → FAIL.
- [ ] **Step 3:** Map tooltip items through `onRenderContent` (or `contextualMenuItemAs`) wrapping the default content in `TooltipHost` with a stable id, plus `ariaDescription`; for disabled+tooltip use Fluent's focusable-disabled path (check `IContextualMenuItem.inactive` vs `disabled` and `data-is-focusable`; if neither keeps it in the roving order, render it enabled with `aria-disabled` and a guarded `onClick`).
- [ ] **Step 4:** Re-run → PASS; `npx vitest run test/fluentV8.primitives.test.tsx` PASS.
- [ ] **Step 5: Commit** `feat(react): MenuItem.tooltip, shown on hover and focus (#87)`

### Task 8: `MenuItem.tooltip` in the shadcn skin (#87)

**Files:**

- Modify: `registry/src/speel-shadcn/overlays.tsx` (`ShadMenu` ~:65)
- Test: `registry/tests/menu-tooltip.test.tsx` (new)

- [ ] **Step 1: Write the failing tests:** the same five as Task 7, against `ShadMenu` (Radix `DropdownMenu` roving focus).
- [ ] **Step 2:** `npm --prefix registry test -- tests/menu-tooltip.test.tsx` → FAIL.
- [ ] **Step 3:** Wrap the `DropdownMenuItem` in a Radix `Tooltip` (`TooltipTrigger asChild`); disabled+tooltip: Radix `disabled` items are skipped by roving focus, so render it non-`disabled` with `aria-disabled="true"`, `onSelect={e => e.preventDefault()}` and the disabled styling.
- [ ] **Step 4:** Re-run → PASS; `npm run sync:skin && npm --prefix registry run registry:build && npm run check:skin && npm --prefix registry run typecheck`.
- [ ] **Step 5: Commit** `feat(shadcn): MenuItem.tooltip (#87)`

## Cycle 2 — table

### Task 9: Column `export: false` (#92)

**Files:**

- Modify: `packages/speel-react/src/table/columns.ts` (`ColumnOptions` ~:15, `ResolvedColumn` ~:66, `resolveColumns` ~:385)
- Modify: `packages/speel-react/src/table/SpeelTable.tsx` (the CSV/xlsx/print call sites ~:457-478)
- Test: extend `test/SpeelTable.export.test.tsx`, `test/SpeelTable.xlsx.test.tsx`, `test/SpeelTable.print.test.tsx`, `test/SpeelTable.search.test.tsx`

**Interfaces:**

- Produces: `ColumnOptions.export?: false`; `ResolvedColumn.export?: false`; `const exported = visible.filter((c) => c.export !== false)` used by all three builders.

- [ ] **Step 1: Write the failing tests:** `CSV omits an export:false column (header and cells)`; `xlsx omits it`; `print omits it`; `it still renders, sorts and appears in the column chooser`; `search still matches its text`.
- [ ] **Step 2:** in packages/speel-react: `npx vitest run test/SpeelTable.export.test.tsx test/SpeelTable.xlsx.test.tsx test/SpeelTable.print.test.tsx test/SpeelTable.search.test.tsx` → FAIL on the new tests.
- [ ] **Step 3:** Carry the option through `resolveColumns`; filter at the three call sites only.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5: Commit** `feat(react): let a table column opt out of export and print (#92)`

### Task 10: Row actions that vary by row (#79)

**Files:**

- Modify: `packages/speel-react/src/table/SpeelTable.tsx` (`rowActions` type ~:90, actions column ~:393-440); export `RowActionKey` from `src/index.ts` alongside `RowAction`
- Test: `packages/speel-react/test/SpeelTable.rowActions.test.tsx` (new)

**Interfaces:**

- Produces: `type RowActionKey = "view" | "edit" | "delete" | (string & {})`; `rowActions.available?: (action: RowActionKey, row: T) => boolean`; `rowActions.ariaLabel?: (action: RowActionKey, row: T) => string` (one function for built-ins and customs, keyed by `RowAction.key`; returned string becomes `IconButton.ariaLabel`, `title` stays the tooltip).

- [ ] **Step 1: Write the failing tests:**
  - `available hides an action on rows where it returns false` — `available: (a, r) => a !== "delete" || r.canDelete` → Delete button on row 1 only.
  - `custom actions are keyed by RowAction.key`.
  - `ariaLabel names each row's button` — `ariaLabel: (a, r) => \`${a} item ${r.id}\``→`getByRole("button", { name: "edit item 7" })`.
  - `all actions hidden on a row keeps column width` — every action hidden on one row: cell renders no buttons; the `__actions` column `defaultWidth` equals the all-actions width; remaining icons keep their slot positions on other rows (each action renders in a fixed-width slot, hidden = empty slot).
  - `actions column is still excluded from export` — CSV has no actions column.
- [ ] **Step 2:** in packages/speel-react: `npx vitest run test/SpeelTable.rowActions.test.tsx` → FAIL.
- [ ] **Step 3:** Implement: one ordered list of `{ key, iconName, title, onClick }` (built-ins then customs), each rendered in a 32px slot; a slot whose `available` returns false renders an empty 32px box.
- [ ] **Step 4:** Re-run → PASS; `npx vitest run test/SpeelTable.test.tsx test/SpeelTable.rows.test.tsx` PASS.
- [ ] **Step 5: Commit** `feat(react): row actions can vary by row and carry per-row names (#79)`

### Task 11: Tables inside surfaces; `virtualize` (#81)

**Files:**

- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`TableProps`), `src/table/SpeelTable.tsx` (`SpeelTableProps` + forwarding at `<ui.Table` ~:568)
- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (`V8Table` `DetailsList` ~:1256 and the grouped path ~:1395; `V8Dialog` body div; `V8Panel` only if Fluent's Panel content lacks `data-is-scrollable` — check its rendered DOM first)
- Test: `packages/speel-react/test/fluentV8.tableVirtualize.test.tsx` (new)

**Interfaces:**

- Produces: `TableProps.virtualize?: boolean` and `SpeelTableProps.virtualize?: boolean` (default unset = skin default, on in v8). `SpeelEntityTable` inherits via `Omit<SpeelTableProps, "items">` — confirm it forwards the prop. shadcn: accepted, ignored (no code).

- [ ] **Step 1: Write the failing tests:**
  - `modal body is a scroll parent` — `V8Dialog open` → the body element (the one with `overflow: auto`) has `data-is-scrollable="true"`.
  - `panel content is a scroll parent` — `V8Panel open` → some ancestor of the children has `data-is-scrollable="true"`.
  - `virtualize false renders every row` — `V8Table` with 60 items and `virtualize={false}` → 60 rows (`getAllByRole("row")` minus header) in jsdom.
  - `SpeelTable forwards virtualize` — fakeAdapter `Table` receives `virtualize: false`.
- [ ] **Step 2:** in packages/speel-react: `npx vitest run test/fluentV8.tableVirtualize.test.tsx` → FAIL.
- [ ] **Step 3:** `virtualize === false` → `onShouldVirtualize={() => false}` on `DetailsList` (both paths); add the attribute to the dialog body.
- [ ] **Step 4:** Re-run → PASS; `npx vitest run test/SpeelTable.layout.test.tsx test/SpeelTable.grouping.test.tsx` PASS.
- [ ] **Step 5: Commit** `fix(react): tables in modals render every row; TableProps.virtualize (#81)`

### Task 12: Opt-in Tab between cell editors (#82)

**Files:**

- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (`TableProps`), `src/table/SpeelTable.tsx` (prop + forwarding), `src/fluent-v8/primitives.tsx` (`V8Table`)
- Test: `packages/speel-react/test/fluentV8.cellNavigation.test.tsx` (new)

**Interfaces:**

- Consumes: Task 11's `virtualize`.
- Produces: `TableProps.cellNavigation?: "tab"` and `SpeelTableProps.cellNavigation?: "tab"`. In v8, `cellNavigation === "tab"` → list `FocusZone` and row `FocusZone` get `handleTabKey: FocusZoneTabbableElements.all`, and virtualization is off unless `virtualize === true`. shadcn: accepted, ignored.

- [ ] **Step 1: Write the failing tests** (prop mapping only — jsdom does not run FocusZone's tabindex logic): `vi.mock("@fluentui/react", async (orig) => ({ ...(await orig()), DetailsList: spy }))` where `spy` records its props and renders the original `DetailsList`; render `V8Table` with `cellNavigation="tab"` and assert on the recorded props that `focusZoneProps.handleTabKey === FocusZoneTabbableElements.all`, the row-level equivalent is set, and `onShouldVirtualize()` returns false; with `cellNavigation="tab" virtualize` → virtualization not forced off; without `cellNavigation` → neither is set. `SpeelTable forwards cellNavigation` via fakeAdapter.
- [ ] **Step 2:** in packages/speel-react: `npx vitest run test/fluentV8.cellNavigation.test.tsx` → FAIL.
- [ ] **Step 3:** `DetailsList` `focusZoneProps` for the list; the row zone via `onRenderRow` → `<DetailsRow {...rowProps} rowFocusZoneProps={{ handleTabKey: FocusZoneTabbableElements.all }} />` (and the grouped path at ~:1395).
- [ ] **Step 4:** Re-run → PASS; whole package: `npx vitest run` PASS.
- [ ] **Step 5: Commit** `feat(react): opt-in Tab navigation between table cell editors (#82)`

## Finish

### Task 13: Live checks in the SPFx sample

Needs the user's serve: `npm --prefix samples/spfx-sample run dev` (outside the sandbox) and the sample's Playwright auth. Confirm the :4321 serve comes from this checkout. Do not edit `.ts` files while the specs run.

**Files:**

- Modify: sample web parts only as needed to exhibit the behaviour (a description on a demo field; a required Currency field; a menu item with a disabled+tooltip; an editable table with `cellNavigation="tab"` inside a `SpeelModal` with 60 rows)
- Test: `samples/spfx-sample/tests/fixWave.spec.ts` (new)

- [ ] **Step 1: Write the specs:** `help text under edit field, info icon in view`; `required currency field shows asterisk, label above "USD"`; `disabled menu item tooltip on keyboard focus`; `modal table scrolls to row 60`; `Tab walks cell editors across the row and onto the next row; Tab from the last leaves the table`; `modal and panel named; panel Close button by role`.
- [ ] **Step 2:** `npm --prefix samples/spfx-sample run build:check` PASS, then run the spec with the serve up → PASS. Anything failing goes back to its task.
- [ ] **Step 3: Commit** `test(sample): live checks for the react fix wave`

### Task 14: Docs, changeset, follow-ups, verify

**Files:**

- Modify: `packages/speel-react/docs/fields.md` (help text: edit vs. view), `docs/surfaces.md` (naming, `ariaLabel`, close buttons, menu tooltip if menus live there — else `skins.md`), `docs/tables.md` (`virtualize`, `cellNavigation`, row actions), `docs/table-columns.md` (`export: false` — at the 250-line cap: move text, don't grow), `docs/table-export.md` (export exclusion; fix the search "what export and print read" wording wherever it appears)
- Create: `.changeset/<name>.md` — `"@speel/react": minor`, one paragraph per issue, generic wording
- Re-verify each touched page's canonical example against `packages/speel-react/src/index.ts` exports (read the file)

- [ ] **Step 1:** Update the Capabilities sections; keep each page's four H2s and 100–250 lines (`wc -l`).
- [ ] **Step 2:** Changeset written.
- [ ] **Step 3:** Open follow-up issues: `SpeelModal: content-sized height and width/height props` (copy the spec's Deferred section, link #83) and `useSurfaces().confirm()` (link #83). Comment on #83 pointing at both and noting its naming part ships here.
- [ ] **Step 4:** `npm run verify` PASS and `npm run format:check` PASS.
- [ ] **Step 5: Commit** `docs(react): fix wave docs delta and changeset`
