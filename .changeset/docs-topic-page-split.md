---
"@speel/core": patch
"@speel/react": patch
"@speel/pnpjs": patch
---

Docs: every topic page is back within the 100–250 line budget. New pages: core `loading.md` (include / thenInclude / expand), `files.md` (the `SpeelDocument` shape, folders, uploads, file and folder operations) and `shapes.md` (`@JsonShape`); react `fields.md` (composition, headless fields, people picker, shape editing), `table-filtering.md` (sort, filter, search) and `table-export.md` (CSV, Excel, print). Canonical examples no longer redeclare `Id` on `SpeelEntity` subclasses and mark a re-pointed `Author` and `onModelCreating` `override`, so they compile under `noImplicitOverride`. The pnpjs README explains how a `file:` dependency bundles a second `@pnp/sp` copy and how to avoid it.
