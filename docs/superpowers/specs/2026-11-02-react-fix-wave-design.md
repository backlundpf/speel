# @speel/react fix wave — design

Branch: `fix/react-wave`. Issues: #99, #100, #96, #97 (+ #83's naming part), #87 (surfaces
and fields), #81, #82, #92, #79 (table). One branch, two spec/plan cycles, one docs delta
and one changeset (`minor`: new adapter props) before the squash merge. #83's content
sizing is a separate branch — see "Deferred" below.

## Intent

A wave of small, consumer-reported gaps in `@speel/react`: accessibility holes in the
surfaces, help text and required markers that never reach the screen, and table rough
edges that force apps to drop out of the skin. Each fix should
make the skin do the right thing with no app code, and add only the opt-ins an app
genuinely needs.

**Goals:** every issue in scope closes; both skins (fluent-v8 and the shadcn registry
skin) behave the same; `fakeAdapter` mirrors any adapter contract change; the sample
still passes `heft build`.

**Non-goals:** modal content sizing and `width`/`height` (#83 part 1 — own branch); the
`confirm()` surface helper (#83 part 2 — open a follow-up issue);
DatePicker, Tabs, multi-file input, xlsx typing, rich-text toolbar (#75, #78, #80, #86,
#35); #22's leftovers.

**Anti-goals:** a fix that needs every consumer to change code to get the accessible
behaviour; naming any consumer app in code, tests, docs,
spec, plan or commits (public repo — describe shapes generically).

## Cycle 1 — surfaces and fields

### #99 Field help text (`description`)

`Property.description` is dropped between core and the skin. Carry it through:

- `FieldHandle` gains `readonly description?: string`; `useField` copies it from the
  property when set (spread-if-defined, for `exactOptionalPropertyTypes`).
- `useStandaloneField` accepts a `description` option and forwards it (user decision).
- `SpeelField`'s `chromeOf()` passes `description` to every input body, `JsonFieldBody`
  included.

**Every mode** (user decision, revised after the first build): the text renders under the
field as help text — under an input, and under a view-mode or read-only display alike — as
the v8 `Field` chrome already draws it (subtext + `aria-describedby`). A first build put
the description behind an info icon on displays (`FieldDisplayProps.descriptionAs`); that
was dropped as doing too much.

Tests: edit-mode field renders the text and the input's `aria-describedby` includes its
id; view-mode / read-only displays render the text too and are described by it;
`EntityFields` passes descriptions through; `ShapeFieldRow` passes `property.description`.

### #100 Number/Currency required marker and label placement (v8)

`V8NumberInput` lets Fluent's `SpinButton` draw the label (`V8Field renderLabel={false}`),
but `SpinButton` has no `required` prop and renders its `Label` without it, defaults to
an inline label (`Position.start`), and — inside the prefix/suffix row — puts the
currency code in front of the label. Fix: `V8Field` owns the label (as for text inputs),
`SpinButton` gets no `label`, the input is named through the label; the adornment row
holds only prefix, `SpinButton`, suffix. shadcn is unaffected. Tests per the issue.

### #96 Panel close button name

v8 `SpeelPanel` (Fluent `Panel`) passes `closeButtonAriaLabel: "Close"`. Audit the
modal's and drawer's close controls in both skins for the same gap (the v8 modal's
already has `ariaLabel="Close"`). Test: `getByRole("button", { name: "Close" })`.

### #97 / #83.3 Modal accessible name

The v8 `V8Dialog` gives its title element a stable id (`useStableId`) and passes it as
Fluent `Modal`'s `titleAriaId`, so the dialog is named by its title. With no title, the
dialog falls back to an `ariaLabel` — add `ariaLabel?: string` to `DialogProps` (also
used by the drawer). shadcn already renders a Radix `DialogTitle`/`SheetTitle`; make the
untitled case use `ariaLabel` too rather than an empty title. Describing the dialog by
its body (`aria-describedby`) is out of scope — the body is arbitrary content.

With neither `title` nor `ariaLabel` (my call): no invented generic name ("Dialog" says
nothing an AT doesn't already announce). In development builds the skin logs one
`console.warn` naming the missing prop; shadcn renders no empty `DialogTitle` (use
Radix's `aria-describedby={undefined}`/visually-hidden pattern so Radix's own console
error stays quiet). `ariaLabel` goes into `SurfaceChromeProps` so
`SpeelModal`, `SpeelPanel`, `SurfaceForm` and `useSurfaces` all expose them.

Test: `getByRole("dialog", { name: "<title>" })` for modal and drawer, both titled and
`ariaLabel` variants.

### #87 `MenuItem.tooltip`

`MenuItem` gains `tooltip?: string`, the same contract as `Button.tooltip` (recommended;
approval pending): a real tooltip shown on hover **and** keyboard focus (a native `title` is not
enough — it never shows on focus or touch), dismissible with Escape, exposed as the item's
accessible description, present while `disabled`. A disabled item with a tooltip stays
focusable so the reason can be read. v8: a custom item render wrapping the item content in
`TooltipHost` (plus `ariaDescription`), keeping `ContextualMenu`'s roving focus; verify
Fluent's `disabled` vs. focusable-disabled behaviour. shadcn: a Radix `Tooltip` around the
`DropdownMenuItem`, registry first, then `npm run sync:skin` into the sample;
`fakeAdapter` renders it. Expect one moderate task per skin.

## Cycle 2 — table

### #81 Table inside a surface; `virtualize`

- The scrolling body of the v8 modal and drawer carries `data-is-scrollable="true"`, so
  Fluent `List` virtualization measures against it, and a table in a modal renders every
  row it scrolls to. (Fluent `Panel` may already mark its scroll area — check, don't
  double up.)
- `TableProps.virtualize?: boolean` (default: skin's default, i.e. on). `false` maps in
  v8 to `onShouldVirtualize={() => false}`. `SpeelTable` / `SpeelEntityTable` pass it
  through. shadcn's table doesn't virtualize — accept and ignore.

Test: a 60-row table in a `SpeelModal` with `virtualize={false}` renders 60 rows; the
modal body has `data-is-scrollable`. The windowed case needs a live check (jsdom has no
layout).

### #82 Tab between cell editors (opt-in)

User decision: opt-in. `TableProps.cellNavigation?: "tab"` (name is the builder's to
refine; keep it a string union so arrow-mode or others can join later), passed through
`SpeelTable` / `SpeelEntityTable`. In v8 the table handles Tab and Shift+Tab itself,
moving to the next / previous enabled editor in its rows in reading order, so Tab walks
cell editors across the row and onto the next row, and at either end the key is left to the
browser (Tab from the last editor leaves the table). (As built: setting the FocusZones'
`handleTabKey` was tried first; live, Tab at a row's end landed on the next row's container
instead of its first editor.) Without the option, keyboard behaviour is unchanged. shadcn's table is a plain
grid where Tab already works — accept and no-op.

Virtualization (my call): `FocusZone` can only Tab through rendered rows, so
`cellNavigation: "tab"` defaults `virtualize` to `false`; an explicit `virtualize: true`
wins and is documented as possibly ending Tab at the last rendered row.

Verification is live (Playwright in the SPFx sample): jsdom does not model FocusZone's
tabindex management. Unit-test only the prop mapping.

### #92 Column `export: false`

`ColumnOptions.export?: false` carried onto `ResolvedColumn`. CSV, xlsx and print skip
such columns (filter `visible` before `buildCsv` / `buildXlsx` / `buildPrintHtml`). The
column still renders, sorts, filters and appears in the column chooser. Toolbar search
still matches it (my call: search is about what's on screen); correct the search
docs' "what export and print read" wording.

### #79 Row actions that vary by row

- `rowActions.available?: (action: "view" | "edit" | "delete" | string, row: T) =>
boolean`; custom actions are keyed by `RowAction.key`. An action is not rendered on a
  row where it returns false.
- `RowAction.ariaLabel?: (row: T) => string` for custom actions, and a matching
  `rowActions.ariaLabel?: (action, row) => string` covering the built-ins (builder may
  unify — the goal is that "Edit item 7" is expressible for every action), passed as
  `IconButton.ariaLabel`.
- The actions column keeps its width (sized for all actions) and stays excluded from
  export and print. My call: hidden actions leave their slot empty so the remaining
  icons line up across rows.

## Constraints

- v8 is the shipped Fluent skin; the shadcn skin is authored in `registry/` first and
  synced into the sample (`npm run sync:skin`, `check:skin` gates drift).
- New `SpeelUIAdapter` prop members go in v8, the shadcn registry skin and `fakeAdapter`.
- Relative imports carry `.js`; `npm run verify` and `npm run format:check` before push.
- Docs delta once, at the end of the branch: `surfaces.md` (naming, close buttons),
  `fields.md` (help text), `table-columns.md` / `table-export.md` / `tables.md` as touched
  (table-columns is at the 250-line cap — move, don't grow).

## Deferred: modal content sizing (own branch)

#83 part 1 and `width`/`height` props move to a separate branch so their layout impact is
isolated (user decision). Decisions already made there:

- `DialogProps` gains `width` and `height`, CSS lengths as strings (`"640px"`, `"20vw"`);
  when given, each overrides `size`. `size` keeps setting width only; no new `size` value.
- With no `height`, the modal is content-sized, capped at the viewport height minus
  padding; past the cap the body scrolls.
- Growth rule: while the surface's first content arrives (spinner → content) the modal
  grows in both directions, staying centred; once content is displayed its height holds
  (later content changes scroll inside the body rather than resizing the frame).

Open for that branch's own brainstorm: what signals "content displayed", how drag/resize
re-base on a measured size, drawer behaviour for `height`.

## Left to the builder

Exact prop names where marked; the FocusZone wiring details; how the v8 info icon and
menu tooltip are composed from Fluent parts; test file placement.
