# @speel/react

## 0.1.0-beta.2

### Minor Changes

- cefb352: `alterField` can change a column's type, new fields join the default view, and narrowing type changes are flagged.

  - **`@speel/pnpjs`:** when an `alterField` spec's SharePoint type differs from the column's live type (Text → Note, Note → Text, Choice → MultiChoice, …), the schema provider rewrites the column's `SchemaXml`, keeping its `ID`, `SourceID`, `Name` and `StaticName`, instead of sending a MERGE that SharePoint rejects. The type change runs on its own after the wave's batch. `addField` now adds the column to the list's default view (`AddFieldToDefaultView`) unless the spec sets `addToDefaultView: false` or `hidden: true`.
  - **`@speel/migrations`:** field builders accept the creation-only options `hidden` and `addToDefaultView`. `spFieldTypeOf`, `alterFieldDataLoss` and `annotateDataLoss` are exported. A narrowing type change (Note → Text truncates values to 255 characters; Text → Number, MultiChoice → Choice and similar may drop values) sets `PlanStep.warning`, and at apply time the step's `step-start`/`step-done` events carry `warning`, `MigrateResult.log` gets a `warn …` line and `console.warn` logs it. The step still runs. The snapshot now records SharePoint type names (`Note`, `MultiChoice`, …) for added fields and moves `typeAsString` on `alterField`.
  - **`@speel/migrations-cli`:** `add` prints a stderr warning for each generated step that may lose data and marks it in the generated file with a `// May lose data: …` comment. `SnapshotDiff` gains `warnings`.
  - **`@speel/react`:** the migrations dashboard shows a `⚠ May lose data` line under a warned step in the run log (mirrored with `console.warn`), and a "may lose data" badge with the reason in the preview panel. New accent token `--speel-accent-warn`.

- 074cbb0: A running blocking task now holds the whole page still, keyboard and assistive tech
  included: every body-level layer outside the overlay (open modals and panels too) is
  `inert`, falling back to `aria-hidden` where `inert` is missing. Key events aimed
  elsewhere are stopped, and focus moves into the overlay's status region. The overlay is
  an `alertdialog` with `aria-busy`. When the last blocking task ends, focus goes back to the
  element that held it, if that element is still on the page.

  Modal drag and resize (`useDragResize`) now take touch and pen through pointer events
  (`pointercancel` included), accept `max` and `bounds` to keep the modal inside the
  viewport, and give the corner a named, focusable handle that the arrow keys resize. Both
  skins draw the corner grip and light it on hover or focus. Breaking for custom skins: the
  handle props now carry `onPointerDown` (not `onMouseDown`), and the corner handle must no
  longer be `aria-hidden`.

- 7e7e59d: One `actions` shape everywhere: forms (`SpeelForm`, `SpeelDocumentForm`), the surface content variant (`SpeelModal`/`SpeelPanel`) and the adapter's `MessageBar` take `actions?: SpeelAction[] | ReactNode` — an action array rendered as the skin's buttons, or any node rendered as-is in the action slot. `SpeelAction` gains `appearance` (`primary`/`secondary`/`subtle`/`danger`; `primary: true` stays a shorthand) and `align: "start" | "end"`; `ButtonProps.appearance` gains `"danger"` (v8: red primary button; shadcn: `destructive`). `MessageBarProps` gains `actions` and `multiline`; skins render actions with the exported `SpeelActionBar`. `SpeelFormAction` is now a deprecated alias of `SpeelAction<EntityForm>`. Forms, surface forms and `showForm` requests gain `allowEdit?: boolean | ((entity) => boolean)` (default `true`) for read-only display forms with no Edit path. Custom skins must handle `appearance: "danger"` and `MessageBarProps.actions`.
- b311e5b: Adapter primitives gain optional hints for standalone use: `CheckboxProps.ariaLabel` and
  `indeterminate`, `ButtonProps.tooltip` (shown even while the button is disabled, and used as
  its accessible description), and `placeholder` on `DropdownProps` and `ComboboxProps`. A
  custom skin may implement them; the Fluent v8 and shadcn skins do.

  Fix: a mouse press on the Fluent v8 combobox's caret now opens the list once. It used to
  open on mousedown and close again on release.

### Patch Changes

- 64a38ad: A searchable lookup no longer shows its held value and "No matches." at the same time. On a typed search, both skins list a held value the search did not return only when its text contains what was typed, so a search that matches nothing shows the message alone. A held value that matches but was left off a page of results is still listed. shadcn skin users: re-run the registry `add` to pick up the change.
- 827fbf0: Docs: trimmed the `useDragResize` entry in the skins topic page back under the page-length limit.
- 4a6ce98: A standalone lookup (`useStandaloneField` with a `Lookup` config, rendered through `SpeelField`) now offers options inside a `SpeelProvider`. It resolves its target's set from the config, so it loads the target's rows by default and runs a declared `optionsQueryAsync` or `optionsCreateAsync`, as a form-bound lookup does. Before, only a literal `options` list worked. Outside a provider it still offers only a literal list.
- Updated dependencies [eed7911]
- Updated dependencies [eed7911]
- Updated dependencies [9472f21]
  - @speel/core@0.1.0-beta.2
  - @speel/identity@0.1.0-beta.2
