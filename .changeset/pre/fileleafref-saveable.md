---
"@speel/core": minor
"@speel/migrations-cli": minor
---

New `systemGenerated` column flag (`@TextField({ systemGenerated: true })`, `.isSystemGenerated()`, and on navigations): the provider owns the column, so migrations never provision it. It implies `readOnly` unless `readOnly: false` is given explicitly. `readOnly` now only means "never sent on save". Every `SpeelEntity` / `SpeelDocument` built-in is `systemGenerated`.

`SpeelDocument` redeclares `FileLeafRef` writable: assigning it on a tracked document renames the file through the normal staged `saveChangesAsync()` update, and `FileRef` on the entity follows. On a plain `SpeelEntity` it stays read-only (a list item's `{ID}_.000` placeholder). On `add(entity, { file })` the `file` option still names the upload.

Migration: a `readOnly` column is no longer kept out of migrations. If your model reads a SharePoint built-in by declaring it `readOnly` (e.g. `File_x0020_Type`, or a re-pointed `Author`), change it to `systemGenerated: true` (or `.isSystemGenerated()`), which keeps it read-only too. Otherwise the next `speel-migrations add` will try to create it.
