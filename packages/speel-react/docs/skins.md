# Skins

## What & when

`@speel/react` components are headless by design: rendering is delegated to a
`SpeelUIAdapter` you pass to `SpeelProvider`. A skin is a concrete implementation of
that adapter — a thin mapping from the component contract to a particular component
library. Reach for this page when choosing which skin to use, wiring a skin into the
provider, or building your own.

Two skins exist today. **`fluent-v8`** ships inside the package at `@speel/react/fluent-v8`
and is the zero-setup choice for SPFx hosts: it renders against the ambient Fluent v8 runtime
that SharePoint already injects, requires no additional bundle, and respects the shared
Fabric singleton constraint. **The shadcn/ui skin** is distributed as copy-in source via a
shadcn registry — install it into your own project, own the code, and use it in any host
(Next.js, Vite, Remix, or SPFx via a sidecar recipe) that runs Tailwind. React 17 is
supported; React 18 works equally well.

Skins are interchangeable per-provider: swap the `ui` prop on `SpeelProvider` and every
component in that tree renders with the new skin. You can run different skins in different
subtrees if your app hosts both SPFx and non-SPFx sections.

## Canonical example

**Option A — Fluent v8 (SPFx and Fabric hosts)**

```tsx
import { SpeelProvider } from "@speel/react";
import { fluentV8Adapter } from "@speel/react/fluent-v8";

export function App({ ctx }) {
  return (
    <SpeelProvider db={ctx} ui={fluentV8Adapter}>
      {/* your components */}
    </SpeelProvider>
  );
}
```

**Option B — shadcn/ui (Vite, Next.js, Remix, or SPFx via the sidecar recipe)**

First, install the skin into your project (one-time, adds the source files you own):

```bash
npx shadcn@latest add https://raw.githubusercontent.com/backlundpf/speel/main/registry/public/r/speel-shadcn.json
```

Then wire it in:

```tsx
import { SpeelProvider } from "@speel/react";
import { shadcnAdapter } from "@/components/speel/adapter";

export function App({ ctx }) {
  return (
    <SpeelProvider db={ctx} ui={shadcnAdapter}>
      {/* your components */}
    </SpeelProvider>
  );
}
```

The registry item installs the adapter source under `src/components/speel/` (path
follows your shadcn `components` alias) and adds `@speel/react`, `lucide-react`, and
the TipTap editor packages as dependencies. `@speel/core` is a peer you install
separately.

## Capabilities

### The SpeelUIAdapter contract

A skin implements the `SpeelUIAdapter` interface exported from `@speel/react`. The
interface groups into a handful of capability areas:

**Field primitives** — one slot per field type: text input, rich text input, number
input, dropdown (single and multi-select), radio group, checkbox, date picker, people
picker, combobox, file input, spinner, progress bar, and a read-mode display
(`FieldDisplayProps`). Each slot receives a normalised props object so the skin does
not need to know anything about entity metadata or form state.

**Searchable pickers** — `PeoplePickerProps` and `ComboboxProps` are deliberately the same
shape: a `value` array, an `onChange`, and an `onResolveSuggestions(query)` the skin calls as
the user types. `Combobox` is **every selection field** — Choice, lookup, inverse collection
and the table filter bar's select ([selection.md](selection.md)) — and its `value` is always an
array, so a single-value field passes zero or one `OptionItem` and reads `v[0]` back, which
keeps one code path in every skin. Its list **opens on focus** (and on click; a caret toggles
it), in both skins. Typed text is a query and never a value: only a pick may call `onChange`,
and what it hands back is the caller's own `OptionItem`, `data` and all. `noResultsText` is
the message to show under a query that came back with nothing. The held `value` rides along
in the list so a page that omits it still shows it, but on a typed search a skin lists it
only when its text contains what was typed. A search that matches nothing shows the message
alone, never beside the held row. The `Dropdown` slot remains for fixed micro-lists (the
boolean and date-preset filters, the pager) — it is no longer a field control.

**Creating and "Other"** — two optional members are what a skin implements for values not in
the list; absent, the skin behaves as without them. `ComboboxProps.create` asks for an **Add
row**: shown when the trimmed text is non-empty and matches no suggestion's string `text`
(ignoring case), after the suggestions, reading `Add`, `Adding…` (ignores picks) or `Could not
add` with an error icon whose callout carries `state.message`; a pick calls `onCreate(text)`.
`RadioGroupProps.other` asks for a final **Other** radio with a text box; whether it is chosen
is `other.selected`, owned by the caller, never derived from `value`.

**Rich text** — `RichTextInputProps` carries the HTML string a rich text Note field
stores. Both built-in skins implement it with TipTap. The Fluent v8 skin lazy-loads
the editor as its own chunk (`React.lazy`), so forms without a rich text field pay
zero bundle cost, and it degrades to a plain multiline text field if the chunk fails
to load; the shadcn registry item lists the TipTap packages as npm dependencies the
shadcn CLI installs alongside the copied `rich-text.tsx`.

**Surfaces** — `DialogProps` (modal) and `DrawerProps` (panel) cover the full chrome:
open state, title, body and footer slots, `resizable`, `draggable` (dialog only),
`fullscreenToggle` (dialog only), and `position` (drawer only). Both the Fluent v8 and
shadcn skins implement all flags, so drag/resize/fullscreen parity is maintained across
skins out of the box.

**Table** — `TableProps` carries `TableColumn` specs, `TableSort`, and the table's `minWidth` /
`width` / `maxWidth`; the skin owns header, cell, and sort rendering. Optional column hints:
`defaultWidth`, `grow` / `shrink` / `minWidth` / `maxWidth`, `wrap`, `cellTitle` (hover via
`setOverflowTitle`), `headerContent` (replaces the label). To lay columns out as the built-in
skins do, measure the container with `useContainerWidth`, map each column through `toFlexColumn`
with its `headerFloor` (your header's `HeaderRoom`, a `textMeasurer` for its font) and
whole-pixel cell padding, render the widths `resolveColumnWidths` returns in a table box as
wide as their total, and stop drags at `MIN_RESIZE_WIDTH` and the column's own bounds.

**Menu** — `MenuProps` carries titled sections of items with icons and optional checkmarks.
Map it to the library's own menu (Fluent's `ContextualMenu`, radix's dropdown menu), not
a popover of buttons: roles, arrow keys and checkmark alignment are the point.

**Feedback primitives** — `ButtonProps`, `IconButtonProps`, `MessageBarProps`, and
`PopoverProps` serve every generic action or message. `appearance: "danger"` is a
destructive `Button` in the error color; render `MessageBarProps.actions` (array or node;
`multiline` puts it below or beside the text) with the exported `SpeelActionBar`.

**Standalone controls** — `ariaLabel` names an unlabelled `Checkbox`; `indeterminate` shows
"some selected" (a click reports `true`); `placeholder` explains an empty `Dropdown` or
`Combobox`; a `Button`'s `tooltip` is its description and shows even while it is disabled.

### Skin-support hooks

Two hooks in `@speel/react` spare a skin the dialog and drawer resize/drag logic; both built-in
skins use them:

- **`useDragResize`** — title-bar drag + corner resize for a dialog; the corner handle is a
  tab stop the arrow keys resize, and `max`/`bounds` keep the dialog on screen.
- **`useResizable`** — single-edge resize (a drawer's leading edge): width state plus handle
  props — pointer and keyboard handlers, the `separator` role, and a tab stop.

Each built-in skin also keeps a small `useStableId` — one id per field, `React.useId` on React 18
and a per-mount counter on React 17, which SPFx runs. It is not exported; copy the shadcn one.

### Naming a field's control

A skin's field chrome has to tie its label to the control, or a screen reader announces
"edit text" with no idea which field it is and `getByLabelText` — the canonical selector
in Testing Library and Playwright — finds nothing.

The rule both skins follow is **whoever renders the control's markup renders its label**.
In the Fluent v8 skin that splits the primitives in two: `TextField`, `SpinButton`,
`Dropdown`, `DatePicker` and `ChoiceGroup` each take a `label` prop and wire the
association themselves, so the chrome passes the label down and draws none of its own.
The controls the skin builds itself — the file input, the people picker, the rich text
editor, the read-only display — carry an explicit id and `aria-labelledby`, and the chrome
draws the single `<Label>` that names them. The shadcn skin owns all of its markup, so it
takes the second path throughout: `Chrome` renders the label, and each field spreads
`fieldAria(id, props)` onto its control.

Help text is wired the same way. The chrome gives its error and description nodes ids and
the control points `aria-describedby` at them, error first — the problem is read before
the hint that would have avoided it.

### Icon vocabulary

High-level components (`@speel/react`) emit icon names using Fluent icon identifiers
(`"Cancel"`, `"View"`, `"Edit"`, `"Delete"`, `"Filter"`). A skin maps those names to whatever
icon library it uses. The shadcn skin maps them to `lucide-react` equivalents in
`src/components/speel/icons.tsx`.

Custom `iconName` values that consumers pass (e.g. on `IconButtonProps`) use the
skin's native vocabulary — lucide names in the shadcn skin, Fluent names in v8. Icon
names are therefore skin-specific strings and are not portable across skins.

### The speel default theme

The shadcn skin ships with a density-first design theme baked into the registry item's
`cssVars`. The guiding principle is information density for power-user data apps: the
global `--spacing` token is set to `0.2 rem` (versus the Tailwind default of `0.25 rem`),
compressing every padding, gap, and size utility by ~20% without any class changes.
`--text-sm` is tightened to `0.8125 rem` to match. The palette is near-monochrome slate
with a single blue accent (`--primary`); `--radius` is `0.3 rem`. Both light and dark
schemes are defined. To retheme: edit the CSS custom property values in your project's
`index.css` (or the sidecar entry for SPFx) — every component reads the variables
at render time, so a single token change propagates everywhere.

### Writing your own skin

Implement `SpeelUIAdapter` (imported from `@speel/react`) and pass the object as
`SpeelProvider`'s `ui` — there is no base class to extend. The shadcn skin in
`registry/src/speel-shadcn/` is the reference implementation of the full adapter.

## Boundaries & gotchas

**The shadcn skin is copy-in source — you own it.** It is not an npm package. After
installing it once you are responsible for keeping it up to date when `@speel/react`
adds new adapter members. Re-run the registry `add` command to receive updates, or
patch the files manually.

**SPFx hosts: fluent-v8 is the zero-setup default; the shadcn skin is supported via the sidecar recipe.** The Fabric-singleton constraint forbids bundling a second _Fluent_ runtime — it does not forbid non-Fluent skins. Running the shadcn skin in a web part requires the React 17-compatible skin build, a Tailwind sidecar whose preflight is isolated in the lowest cascade layer (so SharePoint's unlayered styles override it and the shared page is left untouched), and the `speel-shadcn` wrapper class; follow the recipe in `samples/spfx-sample/README.md`.

**A Json field's row frame is unskinned DOM, deliberately.** Each repeater row is a plain
`<fieldset>` with a `<legend>`, not an adapter member — the nested fields inside it go
through your skin as usual, only the frame around them does not. It is a decision, not an
oversight: a new adapter member costs an implementation in every skin, and `<fieldset>` is
the element a group of related fields is already supposed to be. Style it from your own CSS
if it needs to match; a `Repeater` member is a later question.

**Two Fluent controls refuse `aria-describedby`.** `DatePicker` overwrites it with its
own internal description node and `ChoiceGroup` drops it, through the DOM attribute and
the camelCase `ariaDescribedBy` prop alike. Both are still correctly _named_; only the
link to the description and error text is missing, and the error keeps `role="alert"`, so
it is announced when it appears rather than on focus. Nothing in the skin papers over
this — patching the attribute onto the rendered node after the fact would break silently
on a Fluent upgrade.

**The combobox opens on focus in both skins — and that is not a cold read.** A user clicking
a four-option Status field expects four options. The field body loads its options on that
first ask, not at mount, and a declared list answers from memory. Tests should still drive
`onResolveSuggestions` and the rendered options rather than a particular gesture.

**The Fluent Add row describes its failure through the option's `title`.** Fluent's
`ComboBox` renders an option with no `aria-describedby` of its own, so the v8 skin puts the
failure message in the option's `title` (and a `TooltipHost` callout on the error icon). The
shadcn skin wires the message as the row's `aria-describedby`.

**Fluent's `autoComplete="on"` can commit an inline-completed prefix on blur.** The v8
combobox runs `allowFreeform` with `autoComplete="on"`, so a typed prefix completes inline to
a matching option and leaving the field commits it. What commits is always an `OptionItem` the
caller supplied — never invented text — and text that matches nothing commits nothing, leaving
the box to revert. `allowFreeform` is not negotiable: with it off, Fluent's input stops being
a text box (printable keys are reported one at a time, a paste produces no query at all, and
IME composition breaks).

**One skin per SpeelProvider.** Each `SpeelProvider` accepts exactly one `ui` adapter. To mix
skins on one page, mount separate `SpeelProvider` trees with their own `ui` and `DbContext`.

**`iconName` is not a portable string.** An icon name that works in the shadcn skin
(`"Pencil"` from lucide) will not resolve in the Fluent v8 skin (`"Edit"` is the
Fluent name). Do not hard-code skin-specific icon names in shared component code.

**Registry item does not install `@speel/core`.** The item adds `@speel/react` and
`lucide-react`; install `@speel/core` separately and configure a `DbContext` for `SpeelProvider`.
