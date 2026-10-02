# @speel/migrations-cli

Design-time CLI that generates [`@speel/migrations`](../speel-migrations) migration files by diffing your `@speel/core` model against a committed JSON snapshot. Node-only; install as a dev dependency.

See the [`@speel/migrations` README](../speel-migrations) for the full workflow. This page is the command reference.

## Install

```bash
npm install --save-dev @speel/migrations-cli@beta
```

Peers: `@speel/core` and `@speel/migrations` (already in your app). Requires Node ≥ 18.18.

## Config

```ts
// speel.migrations.config.ts
import { defineMigrationsConfig } from "@speel/migrations-cli";
import { AppContext } from "./src/.../AppContext";

export default defineMigrationsConfig({
  context: AppContext, // your DbContext subclass
  migrationsDir: "./src/.../migrations", // where migration files + index.ts are written
  snapshot: "./src/.../migrations/model-snapshot.json",
});
```

Paths are resolved relative to the config file. The CLI loads the config (and your `.ts` model) via [`jiti`](https://github.com/unjs/jiti); it constructs your `DbContext` with a stub provider and reads the built model — **no SharePoint connection is made at design time.**

## Commands

Wire these into `package.json` scripts (run from your project, where the config lives):

```jsonc
{
  "scripts": {
    "migrations:add": "speel-migrations add  --config speel.migrations.config.ts",
    "migrations:list": "speel-migrations list --config speel.migrations.config.ts",
  },
}
```

| Command      | What it does                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `add <Name>` | Diff the model vs. the snapshot → write `<YYYYMMDDTHHmm>_<Name>.ts` (filled `up`/`down`), rewrite `model-snapshot.json`, append to `index.ts`. Errors if there are no model changes. |
| `list`       | List local migrations and report whether the model has **un-generated changes** (drift from the snapshot).                                                                           |
| `remove`     | Delete the latest migration and restore the snapshot it was generated against.                                                                                                       |

```bash
npm run migrations:add -- AddProjectStartDate
# → Created migration 20260608T1854_AddProjectStartDate

npm run migrations:list
# → 2 migration(s): … | Snapshot is up to date.
```

The diff maps a model change to operations — new list → `createList` + `addField`s (all lists created before any fields, so cross-list lookups resolve); added/removed/changed field → `addField`/`dropField`/`alterField`; index change → `addIndex`/`dropIndex` — and mirrors each into `down`. It never infers renames (drop + add); hand-merge those into `renameField`/`renameList`.

A changed field type (say `isText()` → `isNote()`) becomes an `alterField` both ways. When either direction may lose data — Note → Text truncates to 255 characters, MultiChoice → Choice keeps one value — `add` prints a warning to stderr naming the migration, direction and step, and marks that line in the generated file with a `// May lose data: …` comment. Nothing is blocked; the Migrator repeats the warning when the step is applied.
