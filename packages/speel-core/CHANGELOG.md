# @speel/core

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
