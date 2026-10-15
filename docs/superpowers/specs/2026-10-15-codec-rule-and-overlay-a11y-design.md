# Codec per-element rule, overlay focus return, popover semantics, label-less fields — design

Date: 2026-10-15 · Status: approved in conversation, pending written-spec review · Branch:
`fix/codec-overlay-a11y-69-71-72-76-77` · Issues: #69, #71, #72, #76, #77

## Goal

Five consumer-reported defects, two packages, one branch:

- **#69 (`@speel/core`)** — a codec runs element-wise on a single-valued column whose model is an
  array, so a Note column holding a JSON-encoded array saves as an array of strings and SharePoint
  answers 400.
- **#71 (`@speel/react`, v8)** — closing a Panel or Modal hands focus back with a plain `.focus()`,
  so a surface opened from a non-focusable click target scrolls the page to the top.
- **#72 (`@speel/react`, both skins)** — `ui.Popover` has no dialog semantics, its trigger cannot
  say it opens a popup, Tab walks out to the end of `<body>`, and focus return depends on the browser.
- **#76 (`@speel/react`, both skins)** — editors in a table cell have no way to be named without the
  stacked label; text and number inputs take no placeholder; a multiline input cannot grow; an icon
  button's tooltip and accessible name are one string.
- **#77 (`@speel/react`, v8)** — arrow keys on a closed single-select Dropdown change its value.

Every adapter-contract change is optional and additive: no consumer breaks on upgrade. Success is a
consumer upgrading the beta and deleting its workarounds (a focusable row trigger, hand-set aria
attributes, raw Fluent controls kept for the missing props).

## 1. Codec per-element rule (#69)

**The rule lives in one predicate**, `isMultiValued(config: FieldConfig): boolean` in `Metadata`:
true only for `kind` `"Lookup"` or `"Choice"` with `multi: true`. It is decided from config, never
from the value's runtime shape.

Every place that applies the author's provider pair follows it:

| Value                                                                                                                        | Codec runs               |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| multi-valued column, array model                                                                                             | per element              |
| everything else — single-valued columns (array model or not), Json and MultiJson, a multi column whose model is not an array | once, on the whole value |

**Sites** (all four that branch on `Array.isArray` today):

- `PayloadBuilder.toProviderValue` — write, both `buildForAdd` and `buildForUpdate`. Its Json special
  case is subsumed (Json is never multi-valued under the predicate); its comment is kept with the rule.
- `Materialize.item` — read.
- `shapeCodec` `toPlain` / `toInstance` — write/read of a property inside a Json shape.

`serialize.ts` is untouched: it runs only the wire pair, whose only default (DateTime) is never
array-valued, and the author cannot set `toWire`/`fromWire`.

**Behaviour change.** A single-valued column with an array model now gets its codec once on the
whole value, both ways: the issue's Note column sends `'[{"propertyName":"username"}]'`. At the top
level the old behaviour always failed with a 400, so no stored data depends on it. Inside a Json
shape the old behaviour wrote an array of per-element values; such a blob, written by an earlier
beta, does not read back cleanly. That is documented as a gotcha, not tolerated in code — it needs
an array-model codec on a property inside a shape to have been saved at all.

## 2. Focus return when an overlay closes (#71)

### The shared helper

`@speel/react` exports a hook for skins (beside `useDragResize`), so both skins share one rule:
`useFocusReturn({ open, returnFocus })` → `{ restore(focusWasInside: boolean): void }`.

- **Capture.** In the commit where `open` turns true, before the surface moves focus inside, it
  remembers `document.activeElement` (the opener). It does not trust Fluent's capture.
- **Resolve the target** when `restore` runs:
  - `returnFocus` unset → the opener.
  - `returnFocus` an element, or a function (called now, not at open) → that element; if it resolves
    to `null`/`undefined`, fall back to the opener.
  - `returnFocus === false` → do nothing; the consumer moves focus itself.
- **Guards.** Skip when the target is `document.body`, is not connected, or has no `focus`. Skip when
  focus has gone elsewhere: the move happens only if `focusWasInside` (the skin's report that focus
  was inside the surface) or the active element is `body`/null — so a user who deliberately moved
  focus keeps it (the guard Fluent applies today).
- **Move.** `target.focus({ preventScroll: true })`.

### Contract

```ts
export interface DialogProps {
  // …existing
  /**
   * Where focus goes when the surface closes. Unset: back to what had focus when it opened.
   * An element, or a function called at close: there instead (falls back to the opener when it
   * resolves to nothing). `false`: speel leaves focus alone. Never scrolls the page.
   */
  returnFocus?: HTMLElement | (() => HTMLElement | null | undefined) | false;
}
```

`DrawerProps` inherits it. `SurfaceChromeProps` (the base of `SpeelPanel`'s `PanelChromeProps` and
`SpeelModal`'s `ModalChromeProps`) takes the same field, passed through in both the content variant
and the `SurfaceForm` variant. `fakeAdapter` accepts it.

### Skins

- **v8 (`V8Panel`, `V8Dialog`).** Turn off both Fluent restore paths —
  `focusTrapZoneProps={{ disableRestoreFocus: true }}` and a replaced `popupProps.onRestoreFocus` —
  and call the helper's `restore(params.containsFocus)` from that replaced hook. Fluent calls it as
  the surface's content unmounts, so the focus trap is gone and cannot pull focus back. X, Esc,
  light dismiss and a footer action that sets `open` false all take this one path. `V8Dialog`'s
  existing focus-into-the-modal effect is unchanged.
- **shadcn (`ShadDialog`, `ShadDrawer` — a Sheet).** Radix already restores with `preventScroll`; for one
  behaviour across skins the skin still uses the helper through `onCloseAutoFocus`
  (`e.preventDefault()`, then `restore(true)` — a Radix Dialog/Sheet is modal, so focus is inside).

## 3. Popover semantics and keyboard (#72)

### Contract

```ts
/** What a popover hands a trigger function: spread it onto `ui.Button` / `ui.IconButton`. */
export interface PopoverTriggerProps {
  ariaExpanded: boolean;
  ariaHasPopup: "dialog";
  /** The popup's id while open; undefined while closed (never points at a missing element). */
  ariaControls: string | undefined;
}

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A node, or a function given the trigger's aria wiring. The trigger toggles `open` itself. */
  trigger: ReactNode | ((t: PopoverTriggerProps) => ReactNode);
  /** The popup's accessible name. */
  label?: string;
  children: ReactNode;
}
```

`ButtonProps` and `IconButtonProps` gain `ariaExpanded?: boolean`,
`ariaHasPopup?: AriaAttributes["aria-haspopup"]` (React's own value set, so a menu trigger can say
`"menu"`) and `ariaControls?: string`. Fluent's buttons pass native `aria-*` through when there is no
`menuProps` (verified in `BaseButton`).

Usage:

```tsx
<ui.Popover label="Contact" open={open} onOpenChange={setOpen}
  trigger={(t) => <ui.Button text="Org" {...t} onClick={() => setOpen((o) => !o)} />}>
```

### Behaviour (both skins)

- **Open.** The content element carries `role="dialog"`, `aria-label={label}` and the generated id.
  No `aria-modal`: the popover does not trap focus. Initial focus goes to the first focusable element
  inside, as today.
- **Tab out.** On the content, Tab from the last focusable element, Shift+Tab from the first, or
  either when nothing inside is focusable: `preventDefault`, `onOpenChange(false)`, focus the trigger.
- **Esc / outside click** close (existing skin behaviour) and focus the trigger.
- **Return target** is the trigger — the first focusable element inside the trigger wrapper — not
  whatever had focus at open. That makes return independent of Safari not focusing a clicked
  `<button>`. It goes through the same guards as §2 (`preventScroll`, skip detached, leave focus
  alone when the user clicked a focusable element elsewhere).
- **One helper.** The keyboard and focus logic lives in `usePopoverFocus({ open, onOpenChange })`,
  exported from `@speel/react` beside `useFocusReturn`; it returns the wrapper ref, the content id,
  the trigger props, the content key handler and the restore call. Each skin only maps it onto its
  primitives.

### Skins

- **v8.** `V8Popover` wires the Callout to the helper and replaces the Callout's `onRestoreFocus`.
  `V8Button` / `V8IconButton` pass the three aria fields through.
- **shadcn.** `ShadPopover` drops `PopoverTrigger asChild` around a `<span>` — the reason Radix put
  `aria-expanded` on a span that cannot take focus — for `PopoverAnchor` (positioning only), and
  renders the trigger itself. Radix therefore no longer toggles; the trigger's own `onClick` does,
  which the v8 skin has always required (and which removes a double toggle that only agreed by
  coincidence). `onCloseAutoFocus` is prevented and routed to the helper. The shadcn buttons pass the
  aria fields through. The sample copy is refreshed with `npm run sync:skin`.
- **`ColumnChooser`** adopts the form: `label="Choose columns"`, a trigger function spread onto
  `ui.IconButton`, `toggled` kept for the pressed look.
- **`ViewPicker`'s menu trigger** sets `ariaHasPopup: "menu"` and `ariaExpanded` (a one-line use of
  the new button fields).
- **`fakeAdapter`** supports the trigger function and `label`, and passes the button aria fields.

## 4. Label-less field primitives (#76)

### Contract

- **`FieldChrome.ariaLabel?: string`** — every field primitive can be named without the label
  chrome. Rule: `label` renders the label and names the control; `ariaLabel` names it only when there
  is no `label`. `DropdownProps.ariaLabel` and `CheckboxProps.ariaLabel` fold into it (same type).
  Every field primitive in both skins honours it: TextInput, RichTextInput, NumberInput, Checkbox,
  Dropdown, RadioGroup, DatePicker, PeoplePicker, Combobox, FileInput. `FieldDisplay` renders no
  label when only `ariaLabel` is given.
- **`placeholder?: string`** on `TextInputProps` and `NumberInputProps` (Dropdown and Combobox have
  one).
- **`TextInputProps.autoGrow?: boolean`** — a multiline input sizes to its content. v8:
  `autoAdjustHeight`. shadcn: its textarea already sizes to content (`field-sizing-content`), so
  `true` keeps that. Unset is the skin default; form layouts do not change.
- **`IconButtonProps.ariaLabel?: string`**, defaulting to `title`: "Edit item 7" announced, "Edit" as
  the tooltip.

### Pass-through

`StandaloneFieldOptions` and `FieldHandle` gain optional `ariaLabel`, `placeholder` and `autoGrow`
(form-bound fields leave them unset). `SpeelField`:

- `ariaLabel` set → the chrome carries `ariaLabel` and no `label`;
- `placeholder` → whichever primitive the field's kind renders, when it takes one;
- `autoGrow` → a multiline Text field's TextInput.

## 5. Arrow keys on a closed Dropdown (#77)

v8 only, no new prop. On a **closed single-select** `V8Dropdown`, via Fluent's `onKeyDown` (Fluent
skips its own handling when the event is `defaultPrevented` — verified):

- ArrowUp / ArrowDown without Alt or Meta → `preventDefault`, open the list (a skin-held
  `componentRef`, `focus(true)`).
- Home / End → `preventDefault` (Fluent would otherwise change the value; Radix ignores them too).
- Alt/Meta+Arrow keep Fluent's meaning; an open list is untouched.

Multi-select already opens on the arrow keys without changing the value (verified in
`Dropdown.base`) and is left alone. The shadcn single-select is a Radix Select, whose trigger already
opens on the arrow keys — the two skins now agree.

## Testing

jsdom, `HTMLElement.prototype.focus` spied where focus is asserted.

- **Core (#69), against the fake provider:** a Note and a Text column with an array-model codec each
  write one string on add and on update and read back; multi-Choice and multi-Lookup codecs still run
  per element; Json and MultiJson unchanged; a Text property with an array-model codec inside a Json
  shape writes one string and reads it back.
- **Surfaces (#71), each of v8 Panel, v8 Modal, shadcn Dialog, shadcn Sheet:** opened from a focused
  button and closed → that button focused with `{ preventScroll: true }`; opened while `body` had
  focus → no focus call; opener removed before close → no call; `returnFocus` as an element, as a
  function (called only at close), and `false`; focus moved outside before close → left there. Plus
  `SpeelPanel`/`SpeelModal` pass `returnFocus` through.
- **Popover (#72), both skins:** the trigger function receives the right values closed and open, and
  the rendered button carries them; `role="dialog"` and the label; Tab from the last, Shift+Tab from
  the first, and Esc each close and focus the trigger with `{ preventScroll: true }`; a `ReactNode`
  trigger still opens and gets focus back; `ColumnChooser` updated.
- **Fields (#76):** each primitive in both skins named by `ariaLabel` with no label; a standalone
  field with `ariaLabel` renders no label (Text, Choice, DateTime); `placeholder` and `autoGrow` reach
  the input; `IconButton` named by `ariaLabel` with `title` as tooltip.
- **Dropdown (#77):** ArrowDown and ArrowUp on a closed single-select open it without `onChange`;
  Home/End do nothing; Alt+ArrowDown still opens.
- **Gates:** `npm run verify` (core/react/registry typecheck and tests, `check:node-esm`,
  `check:skin`); the spfx-sample `heft build` (it is not in the core gate).

## Docs & release

Docs are the branch's single document step, after implementation:

- `@speel/core` `modeling.md` (codec section: the per-element rule) and `shapes.md` (the old-blob
  gotcha). `modeling.md` is at the 250-line cap — trim to fit.
- `@speel/react` `surfaces.md` (`returnFocus`, no-scroll restore), `skins.md` (Popover label and
  trigger function, button aria fields, `FieldChrome.ariaLabel`, placeholder/autoGrow, IconButton
  `ariaLabel`, closed-dropdown keys), `fields.md` (standalone `ariaLabel`/`placeholder`/`autoGrow`).
  `skins.md` is at the cap — trim or split.

One changeset: `@speel/core` patch (the codec rule), `@speel/react` minor (the contract additions).

## Out of scope

#56 and #59 (tracked re-query semantics — their own branch); #54; #75, #78, #79, #80 (the
inline-edit-table follow-ups — #79's per-row accessible name builds on §4's `IconButton.ariaLabel`);
#73, #35, #22, #5.
