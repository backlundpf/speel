# `systemGenerated` columns; `FileLeafRef` writable on documents only — design

Date: 2026-10-02 · Status: approved by the owner in conversation · Issue: #38

## Problem

`readOnly` on a property does two unrelated jobs:

1. **Persistence.** `PayloadBuilder` never sends a read-only column (it is skipped
   silently), and `DbSet.add()` rejects a new entity that carries a value in one.
2. **Provisioning.** The migrations snapshot (`speel-migrations-cli/src/snapshot.ts`
   `fieldsFor`) leaves read-only properties and read-only self-FK navigations out, so a
   model never provisions over SharePoint's built-ins.

`FileLeafRef` needs these two answers to differ: SharePoint provides the column (never
provision it), but on a document library it is the file name and must save through the
normal update (a rename). One flag cannot say that. The earlier attempt on this branch
patched provisioning with a by-name list (`WRITABLE_BUILT_INS`).

A second fact narrows the fix: on a generic list item `FileLeafRef` is SharePoint's
placeholder (`{ID}_.000`) and cannot be renamed. Only a `SpeelDocument` row's
`FileLeafRef` is writable.

## Decisions

| Topic                                | Decision                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New flag                             | `systemGenerated: boolean` on `Property`, next to `readOnly`, meaning "the provider owns this column; never provision it". Exposed everywhere `readOnly` is: `FieldOptions.systemGenerated`, the fluent `.isSystemGenerated(value = true)` on `FieldRefinementBuilder`, the navigation option bag (`@ManyToOne(..., { systemGenerated })`), and `INavConfig` / the navigation record. Default `false`. |
| `readOnly` keeps one meaning         | Never sent to the provider (skipped silently at save, as today). Nothing about `readOnly` decides provisioning any more.                                                                                                                                                                                                                                                                               |
| `systemGenerated` implies `readOnly` | When `systemGenerated` is true and `readOnly` was **not given explicitly**, `readOnly` resolves to `true`. An explicit `readOnly: false` (or `.isReadOnly(false)`) clears it. Resolution happens where the field state / navigation config is turned into a `Property` / navigation record, so the resolved `readOnly` is what every consumer reads.                                                   |
| Built-ins on `SpeelEntity`           | `Created`, `Modified`, `Author`, `Editor`, `FSObjType`, `FileDirRef`, `FileRef`, `FileLeafRef` declare `systemGenerated: true` and drop their explicit `readOnly: true` (implied). All stay TS `readonly`. `FileLeafRef` is back to read-only on `SpeelEntity`.                                                                                                                                        |
| Built-ins on `SpeelDocument`         | `FileSize` and `CheckedOutBy` likewise `systemGenerated: true`. `SpeelDocument` redeclares `FileLeafRef` as `@TextField({ systemGenerated: true, readOnly: false, visible: false }) override FileLeafRef?: string` (no TS `readonly`). This is the only explicit `readOnly: false` in the library. Properties merge by name, so the subclass declaration replaces the base one.                        |
| Key                                  | The key property (`ID`) stays `readOnly: true, key: true`; the snapshot already skips `p.key`. It does not need `systemGenerated`.                                                                                                                                                                                                                                                                     |
| Migrations snapshot                  | `fieldsFor` skips `p.systemGenerated` (not `p.readOnly`) for properties and `nav.systemGenerated` (not `nav.readOnly`) for self-FK navigations. `WRITABLE_BUILT_INS` is deleted.                                                                                                                                                                                                                       |
| Change tracker                       | Navigation fixup keeps skipping on `nav.readOnly` (`ChangeTracker.ts` ~256/287/321): it is a write concern, and `Author`/`Editor` still resolve to read-only.                                                                                                                                                                                                                                          |
| UI                                   | Unchanged: forms and `EntityFields` read the resolved `readOnly`. A `SpeelDocument` form's `FileLeafRef` becomes editable when a consumer makes it visible.                                                                                                                                                                                                                                            |
| Kept from the earlier branch work    | (a) after an update that carried `FileLeafRef`, `SaveExecutor` moves the entity's `FileRef` to the new leaf name in the same folder before the snapshot refresh (as `renameFileAsync` does); (b) `FakeStorageProvider` renames on a `FileLeafRef` update like SharePoint; (c) `FileLeafRef` is filtered out of upload metadata on `add(entity, { file })`, so the `file` option names the file.        |
| `DbSet.add()` read-only check        | Unchanged. It now also rejects a value in `FileLeafRef` on a plain `SpeelEntity` (read-only again) and accepts one on a `SpeelDocument` add, where (c) keeps it out of the upload metadata.                                                                                                                                                                                                            |

## Behaviour change (minor under 0.x)

A model that read some other SharePoint built-in by declaring it `readOnly` (say
`File_x0020_Size`) relied on `readOnly` to keep migrations from provisioning it. After
this change a `readOnly` column that is not `systemGenerated` is provisioned like any
model column. Such a model adds `systemGenerated: true`, which also keeps it read-only.
Changeset: **minor** for `@speel/core` and `@speel/migrations-cli`; the changeset and
`modeling.md` say how to migrate.

`readOnly` without `systemGenerated` now means "a model-owned column the app never
writes" (e.g. a column a SharePoint workflow or calculated formula fills); it is
provisioned and never sent.

## Out of scope

- Whether `DbSet.add()` should keep throwing on a read-only value, given that saves drop
  read-only writes silently. Left as is; to be decided separately.
- A calculated-column field type.
- `alterField` on a `systemGenerated` column (e.g. relabelling `Title`). Not addressed
  here.

## Testing

- Model building: `systemGenerated` defaults `readOnly` to true for fields (decorator
  and fluent) and navigations; explicit `readOnly: false` clears it; `readOnly` without
  `systemGenerated` stays provisionable.
- `SpeelEntity` vs `SpeelDocument`: `FileLeafRef` is `readOnly` on a plain list entity
  and writable on a document entity; both are `systemGenerated`.
- Save: a `FileLeafRef` change on a tracked document goes out in the staged update with
  `Title`, and `FileRef` follows; the same change on a list entity is not sent (silent).
  `FileLeafRef` is not sent as upload metadata.
- Snapshot: no built-in is provisioned (including `FileLeafRef` on documents); a
  `readOnly`-only column is provisioned; a `systemGenerated` custom column is not.
- `npm run verify` and `npm run format:check`; the spfx-sample must still build.

## Docs

`speel-core/docs/modeling.md` (Capabilities: `systemGenerated` vs `readOnly`; gotcha:
the provisioning behaviour change), `saving.md` (one sentence: a document's
`FileLeafRef` renames through a normal save), `speel-migrations/docs/workflow.md` (the
provisioning rule now reads `systemGenerated`).
