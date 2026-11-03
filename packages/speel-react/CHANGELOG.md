# @speel/react

## 0.1.0-beta.6

### Minor Changes

- 0cb46c1: Surfaces: modals and panels take `style`, CSS lengths for `width` and `maxWidth` (both) and `height`, `maxHeight`, `top` and `left` (modal only) (#101). `width`/`height` replace what `size` sets, caps yield to the screen, and `height: "auto"` fits a modal to its content, growing and shrinking with it (centred, or downward when `top` is set) until the cap, after which the body scrolls. A user drag or resize takes over (auto height resumes when the modal is next opened). With no `style`, every surface looks as before. `useSurfaces().confirm({ title, message, confirmText, cancelText, destructive })` resolves `true` or `false` from a regular content-sized `SpeelModal` with two actions; a destructive one opens on Cancel, any other on the confirm button (#102). `SpeelAction.autoFocus` gives an action's button focus when its modal opens (found by id: `ButtonProps` gains an optional `id`, and `SpeelActionBar` an `idPrefix`), and `SpeelModal` takes `ariaDescribedBy`. `DialogProps` gains `style`, `ariaDescribedBy` and `initialFocus`, and `DrawerProps` gains `style`; a hand-written `SurfaceApi` now needs `confirm`. Skins: `useModalFrame` (plus `modalFrameCss`, `panelMaxWidth`, `cssLengthPx` and the `DIALOG_*` presets) supersedes `useDragResize`, which is deprecated but unchanged; `useResizable` takes `measure`. The shadcn dialog now honours `defaultFullscreen`.
- efd4dca: Fields: a property's description now reaches its field (#99). It shows as help text under the field in every mode, input or view-mode/read-only display, with `aria-describedby` pointing at it. `FieldHandle` and `useStandaloneField` carry `description`. The fluent-v8 number input (Number and Currency fields) now renders the chrome's label, so a required one shows its asterisk and the label sits above a currency prefix; a label-less (inline) number input is now named too (#100).

  Surfaces: every modal and panel is named by its title, or by the new `ariaLabel` (on `DialogProps` and every surface prop bag, `showForm` included) when it has none; one with neither warns once in development (#97). The fluent-v8 panel's close button is named "Close" (#96). `MenuItem.tooltip` follows `Button.tooltip`'s contract: shown on hover and keyboard focus, the item's accessible description, and present on a disabled item, which stays focusable (#87).

  Tables: `rowActions.available(action, row)` hides an action per row and `rowActions.ariaLabel(action, row)` names each row's button; actions keep fixed slots so the column stays aligned (`RowActionKey` is exported) (#79). A column with `export: false` is left out of CSV, Excel and print while still rendering, sorting, filtering and being searched (#92). `TableProps.virtualize: false` renders every row, and the fluent-v8 modal's body is now a scroll parent, so a table inside a modal draws every row it scrolls to (#81). `cellNavigation: "tab"` lets Tab and Shift+Tab move between editors in cells, and turns virtualization off unless `virtualize` is `true` (#82).

- b532be9: Table views no longer offer actions the user can't save (#105). `UserSettingsStore` gains an optional `canWrite()`; `identity.settings` answers it from the user's add permission on the settings list, read once per identity (and retried after a failed read), and `createEntityUserSettingsStore` takes it as an option. `TableViewStore` gains an optional `canSave()`, which the settings-backed view store answers from `canWrite`; both default to yes when omitted. `useTableViews` exposes `canSaveViews` and `canSetStartingView`, and `canEditActive` now also needs `canSaveViews` for a personal view, so a view the user can't save offers no Save, Rename or Delete and keeps column tweaks for the session. The picker hides Save as new view, Publish and Unpublish when views can't be saved, and offers Start on this view on any saved view, shared ones included, when the setting can be written. A failed check counts as no and never breaks the picker.

### Patch Changes

- a039f31: The unnamed-surface warning (a modal or panel with neither a title nor an `ariaLabel`) now reads `process.env.NODE_ENV` directly, so a bundler's production define silences it in production builds; a bundle with no `process` still counts as development. Doc comment and docs fixes: `RowAction` has its own doc comment again, `pendingDefaultEdits` describes every view that holds edits in the session, and the table-views page notes that Save as new view needs the user to be able to save views.
- Updated dependencies [b532be9]
  - @speel/identity@0.1.0-beta.6
  - @speel/core@0.1.0-beta.6

## 0.1.0-beta.5

### Minor Changes

- 4edb7fb: Table grouping: `groupBy` on `SpeelTable` and `SpeelEntityTable` groups the matched rows into nested, collapsible groups, outermost level first — a field name, a column ref (`p.Status`), or a descriptor with its own `by` (a computed value), `label`, `header`, `collapsed` (the starting state) and `order`. Each group header shows its row count (`Status: Open (12)` by default); a toggle in the header cell in front of the columns expands or collapses every group (as does a click on a group header's text, for that group), and the handles gain `expandAllGroups()` / `collapseAllGroups()`. Collapse state is session-only. Grouping takes precedence over paging: a grouped table is unpaged (with a one-time console warning when a page size is set) and pages where it left off once grouping is removed. Export, print and `onMatchedRowsChange` follow the grouped row order. Skins render groups from the new `TableProps.groups` (`TableGroupNode`) and `onToggleGroup`; both built-in skins do. Default group headers are muted progressively by level (up to three steps). Both skins offset data rows under their innermost group and draw that expand/collapse-all toggle in the leading header cell, driven by the new `TableProps.allGroupsCollapsed` / `onToggleAllGroups`. `SpeelEntityTableHandle` now also carries `exportXlsx()`, and the shadcn skin's `Button` now renders its `iconName`. `GroupDescriptor`, `GroupSpec`, `RowGroup` and `TableGroupNode` are exported.

### Patch Changes

- @speel/core@0.1.0-beta.5
  - @speel/identity@0.1.0-beta.5

## 0.1.0-beta.4

### Minor Changes

- ec04f47: A codec runs per element only on multi-valued columns, so a Note or Text column whose model is an array saves one string (#69). Panels and modals return focus without scrolling the page, with `returnFocus` to choose the target (#71). Popovers are labelled dialogs with trigger aria wiring, Tab-out and focus return to the trigger (#72). `PopoverProps.trigger` may now be a function: re-pull a copied shadcn skin (an older copy renders the function as a child and the column chooser's button disappears), and a custom skin must call a function `trigger` (`usePopoverFocus().renderTrigger` does); the trigger toggles `open` itself in both skins. Field primitives take `ariaLabel`, text and number inputs `placeholder`, multiline text `autoGrow`, icon buttons `ariaLabel`; standalone fields pass them through (#76). Arrow keys open a closed v8 Dropdown instead of changing its value (#77).
- 2f1adb1: Table columns: `p.Field.with({ width, wrap, … })` gives a proxy column options without a string key — the `columns` callback's parameter is now a map of column refs, so drop any `(p: Entity) =>` annotation. New column options `wrap`, `cellTitle: false` and `headerContent`. The Fluent v8 skin starts a column without a width at a default for its field kind, never narrower than its header's longest word; header labels break only at spaces (an over-long word ends in "…") with the filter button beside them; cut-off cells show their full text on hover. The row-actions column is as wide as its buttons. `TableColumn` gains optional `defaultWidth`, `wrap`, `cellTitle` and `headerContent`, and `setOverflowTitle` is exported for skins.

  Columns flex like CSS: each has a basis (`width`) and `grow`/`shrink` weights with per-kind defaults (text, Lookup and Choice columns flex, Note and Json take twice the spare width, Yes/No, numbers, dates and custom columns hold), plus `minWidth`/`maxWidth`; tables take `minWidth`/`width`/`maxWidth` (px or % of the container) and are otherwise exactly as wide as their columns — the v8 skin no longer stretches its last column (`minWidth: "100%"` fills). A dragged column stays where it is dropped, within its own `minWidth`/`maxWidth`, while the others flex around it. The shadcn skin uses the same layout: the per-kind defaults and header floor (it no longer sizes columns to content), fixed table layout sized in the theme's spacing unit, headers that wrap at spaces, horizontal scroll, and the sort arrow only on the sorted column. `TableColumn` gains optional `grow`, `shrink`, `minWidth` and `maxWidth`, `TableProps` gains `minWidth`, `width` and `maxWidth` (`TableLength`), and `resolveColumnWidths`, `toFlexColumn`, `headerFloor`, `textMeasurer`, `useContainerWidth` and `MIN_RESIZE_WIDTH` are exported for skins.

  Columns take `align` (`start` / `center` / `end`) for header and cells. `ui.Link` (a new adapter member): a real link that looks like the skin's links in both its forms — `href` renders an anchor (open in new tab works) and `onClick` replaces navigation on a plain click only; without `href` it is a button that looks the same. Long links truncate at their end and show their full text on hover. A button's tooltip now anchors to the button in any container (#58); a tooltip-wrapped button in a stretching container (a vertical stack, a grid cell) now stretches like the same button without a tooltip, a visible change where such buttons previously sat at content width. For skins, `TableColumn` gains optional `align` (`ColumnAlign`) and `SpeelUIAdapter` gains a `Link` member (`LinkProps`).

### Patch Changes

- Updated dependencies [ec04f47]
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
