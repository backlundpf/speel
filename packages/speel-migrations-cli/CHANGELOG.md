# @speel/migrations-cli

## 0.1.0-beta.3

### Minor Changes

- 7e20c89: New `systemGenerated` column flag (`@TextField({ systemGenerated: true })`, `.isSystemGenerated()`, and on navigations): the provider owns the column, so migrations never provision it. It implies `readOnly` unless `readOnly: false` is given explicitly. `readOnly` now only means "never sent on save". Every `SpeelEntity` / `SpeelDocument` built-in is `systemGenerated`.

  `SpeelDocument` redeclares `FileLeafRef` writable: assigning it on a tracked document renames the file through the normal staged `saveChangesAsync()` update, and `FileRef` on the entity follows. On a plain `SpeelEntity` it stays read-only (a list item's `{ID}_.000` placeholder). On `add(entity, { file })` the `file` option still names the upload.

  Migration: a `readOnly` column is no longer kept out of migrations. If your model reads a SharePoint built-in by declaring it `readOnly` (e.g. `File_x0020_Type`, or a re-pointed `Author`), change it to `systemGenerated: true` (or `.isSystemGenerated()`), which keeps it read-only too. Otherwise the next `speel-migrations add` will try to create it.

### Patch Changes

- Updated dependencies [74d9aea]
- Updated dependencies [1f75380]
- Updated dependencies [7e20c89]
  - @speel/core@0.1.0-beta.3
  - @speel/migrations@0.1.0-beta.3

## 0.1.0-beta.2

### Minor Changes

- cefb352: `alterField` can change a column's type, new fields join the default view, and narrowing type changes are flagged.

  - **`@speel/pnpjs`:** when an `alterField` spec's SharePoint type differs from the column's live type (Text → Note, Note → Text, Choice → MultiChoice, …), the schema provider rewrites the column's `SchemaXml`, keeping its `ID`, `SourceID`, `Name` and `StaticName`, instead of sending a MERGE that SharePoint rejects. The type change runs on its own after the wave's batch. `addField` now adds the column to the list's default view (`AddFieldToDefaultView`) unless the spec sets `addToDefaultView: false` or `hidden: true`.
  - **`@speel/migrations`:** field builders accept the creation-only options `hidden` and `addToDefaultView`. `spFieldTypeOf`, `alterFieldDataLoss` and `annotateDataLoss` are exported. A narrowing type change (Note → Text truncates values to 255 characters; Text → Number, MultiChoice → Choice and similar may drop values) sets `PlanStep.warning`, and at apply time the step's `step-start`/`step-done` events carry `warning`, `MigrateResult.log` gets a `warn …` line and `console.warn` logs it. The step still runs. The snapshot now records SharePoint type names (`Note`, `MultiChoice`, …) for added fields and moves `typeAsString` on `alterField`.
  - **`@speel/migrations-cli`:** `add` prints a stderr warning for each generated step that may lose data and marks it in the generated file with a `// May lose data: …` comment. `SnapshotDiff` gains `warnings`.
  - **`@speel/react`:** the migrations dashboard shows a `⚠ May lose data` line under a warned step in the run log (mirrored with `console.warn`), and a "may lose data" badge with the reason in the preview panel. New accent token `--speel-accent-warn`.

### Patch Changes

- Updated dependencies [cefb352]
- Updated dependencies [eed7911]
- Updated dependencies [eed7911]
  - @speel/migrations@0.1.0-beta.2
  - @speel/core@0.1.0-beta.2
