# @speel/core

## 0.1.0-beta.7

### Minor Changes

- fba9a90: Folders: `DbSet.ensureFoldersAsync(paths)` creates many folders and returns one result per path, in input order, so one bad path never costs the others theirs (#118). With `@speel/pnpjs`, folders at the same depth go out together in one `$batch` (chunked at 100), so round trips scale with folder depth, not folder count. A failure is reported per path: `invalidPath`, `requestFailed` (with the folder's HTTP `status`; when a whole batch request fails there is no per-folder status and the batch error is the `cause`), `notAFolder` (the name is taken by a file or other non-folder item — SharePoint reports that the same way as an existing folder, so each collision is confirmed with one batched `Exists` read), `parentFailed` (an ancestor failed; `cause` is its error) or `noResult`. Folders created before a failure stay; re-running the call is the recovery. An existing folder is now recognized by SharePoint's language-neutral error code rather than English message text, so re-runs also work for non-English users; error messages carry SharePoint's own text instead of the PnPjs request wrapper. New standard outcome type: `Result<T>` (`{ ok, value?, errors? }`, with `ok` deciding which is present), `IError` (`code`, `message`, `target`, `status`, `cause`), the `Result.ok` / `Result.fail` / `Result.unwrap` helpers, and `OperationFailedException` for turning a failed result into a throw. Breaking for custom providers: `IFileSystem.ensureFoldersAsync` now returns `ReadonlyMap<string, Result<string>>` and reports a path's failure in its result instead of throwing (`FolderErrorCode` names the codes). `ensureFolderAsync` now throws `OperationFailedException` when the server refuses the folder, instead of the provider's raw error, and also when a provider returns no result for the path (code `noResult`), where it threw `InvalidOperationException` before. `add({ folder })` reports every folder that could not be ensured in one `DbUpdateException` whose `innerErrors` are every `IError` those folders reported.

## 0.1.0-beta.6

No changes in this release.

## 0.1.0-beta.5

No changes in this release.

## 0.1.0-beta.4

### Patch Changes

- ec04f47: A codec runs per element only on multi-valued columns, so a Note or Text column whose model is an array saves one string (#69). Panels and modals return focus without scrolling the page, with `returnFocus` to choose the target (#71). Popovers are labelled dialogs with trigger aria wiring, Tab-out and focus return to the trigger (#72). `PopoverProps.trigger` may now be a function: re-pull a copied shadcn skin (an older copy renders the function as a child and the column chooser's button disappears), and a custom skin must call a function `trigger` (`usePopoverFocus().renderTrigger` does); the trigger toggles `open` itself in both skins. Field primitives take `ariaLabel`, text and number inputs `placeholder`, multiline text `autoGrow`, icon buttons `ariaLabel`; standalone fields pass them through (#76). Arrow keys open a closed v8 Dropdown instead of changing its value (#77).

## 0.1.0-beta.3

### Minor Changes

- 1f75380: Entities: `DbSet.clone`, `serialize`/`deserialize` with a typed `SerializedEntity<T, M>`, and `EntityEntry.setValues`. `update()` given a different instance for a tracked row now applies its values (previously they were silently dropped). `add()` warns about read-only values instead of throwing, never writes them, and the insert clears them. Forms swap bare navigation stubs for the tracked row.
- 7e20c89: New `systemGenerated` column flag (`@TextField({ systemGenerated: true })`, `.isSystemGenerated()`, and on navigations): the provider owns the column, so migrations never provision it. It implies `readOnly` unless `readOnly: false` is given explicitly. `readOnly` now only means "never sent on save". Every `SpeelEntity` / `SpeelDocument` built-in is `systemGenerated`.

  `SpeelDocument` redeclares `FileLeafRef` writable: assigning it on a tracked document renames the file through the normal staged `saveChangesAsync()` update, and `FileRef` on the entity follows. On a plain `SpeelEntity` it stays read-only (a list item's `{ID}_.000` placeholder). On `add(entity, { file })` the `file` option still names the upload.

  Migration: a `readOnly` column is no longer kept out of migrations. If your model reads a SharePoint built-in by declaring it `readOnly` (e.g. `File_x0020_Type`, or a re-pointed `Author`), change it to `systemGenerated: true` (or `.isSystemGenerated()`), which keeps it read-only too. Otherwise the next `speel-migrations add` will try to create it.

### Patch Changes

- 74d9aea: Docs: every topic page is back within the 100–250 line budget. New pages: core `loading.md` (include / thenInclude / expand), `files.md` (the `SpeelDocument` shape, folders, uploads, file and folder operations) and `shapes.md` (`@JsonShape`); react `fields.md` (composition, headless fields, people picker, shape editing), `table-filtering.md` (sort, filter, search) and `table-export.md` (CSV, Excel, print). Canonical examples no longer redeclare `Id` on `SpeelEntity` subclasses and mark a re-pointed `Author` and `onModelCreating` `override`, so they compile under `noImplicitOverride`. The pnpjs README explains how a `file:` dependency bundles a second `@pnp/sp` copy and how to avoid it.

## 0.1.0-beta.2

### Patch Changes

- eed7911: `mb.shape()`, `@JsonField` and `@MultiJsonField` accept a shape class with no `Id`. Shapes are embedded and have no key, but the entry points required `IEntity`, so TypeScript rejected every Id-less shape as having no properties in common with it.
- eed7911: A navigation decorator's `optionsCreateAsync` and `optionsQueryAsync` accept a callback declared with its own type, such as `OptionsCreator<Person, JobTitle>`. They were typed with `any` as the target, which TypeScript refused for every explicitly typed callback, so only inline lambdas compiled. The navigation's target now decides the callback's target, so a callback for a different entity is refused.
