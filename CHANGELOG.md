# Changelog

All `@speel/*` packages are versioned in lockstep. Prereleases publish under the npm
`beta` dist-tag (`npm install @speel/core@beta`).

## 0.1.0-beta.1 — 2026-09-28

### Fixed

- **@speel/core** — `cacheAsync()` on a list whose `useCaching()` expands a person column
  (a navigation to a principal) no longer fails its sync read. The cache path now tells the
  provider the expand is a person column, as queries always did, so SharePoint is asked only
  for what an inline person expand can answer (#23).

### Security

- **@speel/react** — the `@tiptap/*` dependencies now require `^3.30.5`, which carries the
  fixes for GHSA-cp6q-959q-f8rh (`mergeAttributes()` prototype pollution) and
  GHSA-j95f-988m-3j2f (quadratic ReDoS in Markdown attribute parsing).

## 0.1.0-beta.0 — 2026-09-28

First public beta. APIs may still change between betas; breaking changes will be
called out here.

- **@speel/core** — EF-Core-style data layer for SharePoint in SPFx: decorated entity
  classes, change tracking, fluent queries, navigation/explicit loading, recycle-by-default
  deletes, file/folder documents, JSON complex-object columns, and `saveChangesAsync()`.
  `@speel/core/testing` ships a fake storage provider and provider conformance suite.
- **@speel/pnpjs** — PnPjs v4 SharePoint provider for core, migrations, and identity, plus
  the typed `getSPFI(context)` escape hatch.
- **@speel/migrations** — runtime `Migrator` that applies `up`/`down` schema migrations
  and tracks history in a list.
- **@speel/migrations-cli** — `speel-migrations add | list | remove`: diffs the model against
  a committed snapshot and generates migration files.
- **@speel/identity** — signed-in user, site users and groups, and permission
  reconciliation over SharePoint's security model.
- **@speel/react** — model-driven Fluent UI v8 forms, tables (`SpeelTable`,
  `SpeelEntityTable`), a combobox with create-in-selection, rich text, modal/panel surfaces, toasts, and a
  migrations admin UI.
