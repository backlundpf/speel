# @speel/react

## 0.1.0-beta.4

### Minor Changes

- 2f1adb1: Table columns: `p.Field.with({ width, wrap, … })` gives a proxy column options without a string key — the `columns` callback's parameter is now a map of column refs, so drop any `(p: Entity) =>` annotation. New column options `wrap`, `cellTitle: false` and `headerContent`. The Fluent v8 skin starts a column without a width at a default for its field kind, never narrower than its header's longest word; header labels break only at spaces (an over-long word ends in "…") with the filter button beside them; cut-off cells show their full text on hover. The row-actions column is as wide as its buttons. `TableColumn` gains optional `defaultWidth`, `wrap`, `cellTitle` and `headerContent`, and `setOverflowTitle` is exported for skins.

  Columns flex like CSS: each has a basis (`width`) and `grow`/`shrink` weights with per-kind defaults (text, Lookup and Choice columns flex, Note and Json take twice the spare width, Yes/No, numbers, dates and custom columns hold), plus `minWidth`/`maxWidth`; tables take `minWidth`/`width`/`maxWidth` (px or % of the container) and are otherwise exactly as wide as their columns — the v8 skin no longer stretches its last column (`minWidth: "100%"` fills). A dragged column stays where it is dropped, within its own `minWidth`/`maxWidth`, while the others flex around it. The shadcn skin uses the same layout: the per-kind defaults and header floor (it no longer sizes columns to content), fixed table layout sized in the theme's spacing unit, headers that wrap at spaces, horizontal scroll, and the sort arrow only on the sorted column. `TableColumn` gains optional `grow`, `shrink`, `minWidth` and `maxWidth`, `TableProps` gains `minWidth`, `width` and `maxWidth` (`TableLength`), and `resolveColumnWidths`, `toFlexColumn`, `headerFloor`, `textMeasurer`, `useContainerWidth` and `MIN_RESIZE_WIDTH` are exported for skins.

  Columns take `align` (`start` / `center` / `end`) for header and cells. `ui.Link` (a new adapter member): a real link that looks like the skin's links in both its forms — `href` renders an anchor (open in new tab works) and `onClick` replaces navigation on a plain click only; without `href` it is a button that looks the same. Long links truncate at their end and show their full text on hover. A button's tooltip now anchors to the button in any container (#58); a tooltip-wrapped button in a stretching container (a vertical stack, a grid cell) now stretches like the same button without a tooltip, a visible change where such buttons previously sat at content width. For skins, `TableColumn` gains optional `align` (`ColumnAlign`) and `SpeelUIAdapter` gains a `Link` member (`LinkProps`).

### Patch Changes

- @speel/core@0.1.0-beta.4
  - @speel/identity@0.1.0-beta.4

## 0.1.0-beta.3

### Minor Changes

- 1f75380: Entities: `DbSet.clone`, `serialize`/`deserialize` with a typed `SerializedEntity<T, M>`, and `EntityEntry.setValues`. `update()` given a different instance for a tracked row now applies its values (previously they were silently dropped). `add()` warns about read-only values instead of throwing, never writes them, and the insert clears them. Forms swap bare navigation stubs for the tracked row.

### Patch Changes

- 74d9aea: Docs: every topic page is back within the 100–250 line budget. New pages: core `loading.md` (include / thenInclude / expand), `files.md` (the `SpeelDocument` shape, folders, uploads, file and folder operations) and `shapes.md` (`@JsonShape`); react `fields.md` (composition, headless fields, people picker, shape editing), `table-filtering.md` (sort, filter, search) and `table-export.md` (CSV, Excel, print). Canonical examples no longer redeclare `Id` on `SpeelEntity` subclasses and mark a re-pointed `Author` and `onModelCreating` `override`, so they compile under `noImplicitOverride`. The pnpjs README explains how a `file:` dependency bundles a second `@pnp/sp` copy and how to avoid it.
- Updated dependencies [74d9aea]
- Updated dependencies [1f75380]
- Updated dependencies [7e20c89]
  - @speel/core@0.1.0-beta.3
  - @speel/identity@0.1.0-beta.3

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
