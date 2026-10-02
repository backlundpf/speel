# Migrations workflow

## What & when

Use this page when setting up the four-step change loop for the first time or when you need the
full end-to-end picture: change model → generate → commit → apply. It covers the config file,
CLI invocation, the anatomy of a generated file, and wiring a `Migrator` in your SPFx web part.

## Canonical example

End-to-end: adding a field, generating, and applying.

**1. Update the model** (`AppContext.ts`):

```ts
import { DbContext, ModelBuilder } from "@speel/core";

export class Project {
  Id?: number;
  Title?: string;
  StartDate?: Date;
}

export class AppContext extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Project, (b) => {
      b.toList("Projects", { template: "genericList", url: "Lists/Projects" });
      b.property((e) => e.Title)
        .isText()
        .isRequired();
      b.property((e) => e.StartDate)
        .isDateTime()
        .asDateOnly(); // ← new field
    });
  }
}
```

**2. Config file** (`speel.migrations.config.ts`):

```ts
import { defineMigrationsConfig } from "@speel/migrations-cli";
import { AppContext } from "./src/AppContext";

export default defineMigrationsConfig({
  context: AppContext,
  migrationsDir: "./src/migrations",
  snapshot: "./src/migrations/model-snapshot.json",
});
```

**3. Generate** (once wired into `package.json` scripts):

```bash
npm run migrations:add -- AddProjectStartDate
# → Created migration 20260608T1854_AddProjectStartDate
```

Generated file (`20260608T1854_AddProjectStartDate.ts`):

```ts
import { defineMigration } from "@speel/migrations";

export default defineMigration("20260608T1854_AddProjectStartDate", {
  up(b) {
    b.addField("Projects", "StartDate", (f) =>
      f.dateTime({ displayName: "Start Date", displayFormat: "DateOnly" }),
    );
  },
  down(b) {
    b.dropField("Projects", "StartDate");
  },
});
```

**4. Commit** the migration file, the rewritten `model-snapshot.json`, and the updated `index.ts`.

**5. Apply** in your SPFx web part:

```ts
import { Migrator } from "@speel/migrations";
import { useSharePointSchema } from "@speel/pnpjs";
import { migrations } from "./migrations"; // generated index

const migrator = new Migrator({
  context: ctx,
  schema: useSharePointSchema(spfxContext),
  migrations,
});

await migrator.migrate(); // applies every pending migration
```

## Capabilities

### Config file

`defineMigrationsConfig` takes three fields: `context` (your `DbContext` subclass),
`migrationsDir` (where to write files), and `snapshot` (the committed JSON snapshot).
Paths resolve relative to the config file. The CLI loads config + model via
[`jiti`](https://github.com/unjs/jiti) — no SharePoint connection is made at design time.

Wire up scripts in `package.json`:

```jsonc
{
  "scripts": {
    "migrations:add": "speel-migrations add    --config speel.migrations.config.ts",
    "migrations:list": "speel-migrations list   --config speel.migrations.config.ts",
    "migrations:remove": "speel-migrations remove --config speel.migrations.config.ts",
  },
}
```

### CLI commands

| Command      | What it does                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `add <Name>` | Diffs model vs snapshot, writes `<YYYYMMDDTHHmm>_<Name>.ts`, rewrites `model-snapshot.json`, appends to `index.ts`. Errors if no changes. |
| `list`       | Shows local migrations and reports whether the model has un-generated changes (drift from snapshot).                                      |
| `remove`     | Deletes the latest migration and restores the snapshot it was generated against.                                                          |

### Generated file anatomy

Each generated file calls `defineMigration(id, { up, down })`. The `up` body receives a
`MigrationBuilder` with builder verbs (see [authoring.md](authoring.md)); the `down` body mirrors
it in reverse. The generated `index.ts` exports a `migrations` array in id order — pass it
directly to `Migrator`. It imports each file as `./<id>.js`, the form Node's ESM loader
requires; TypeScript maps that to the `.ts` file under `bundler`, `node16`/`nodenext` and
`node` module resolution alike.

### What the snapshot contains

The snapshot holds only the columns a migration should create: every property and
relationship the model declares, minus the key (`ID`) and minus anything marked
read-only. `readOnly` is the rule — it covers the columns `SpeelEntity` /
`SpeelDocument` inject (`Created`, `Modified`, `FSObjType`, `FileDirRef`, `FileRef`) and
the `Author` / `Editor` navigations; `FileLeafRef` is writable but a built-in, so it is
excluded by name. It is how you surface any other
SharePoint built-in: declare it read-only
(`@TextField({ columnName: 'File_x0020_Type', readOnly: true })`) and the model reads
the column without a migration trying to create it. Read-only navigations are skipped the
same way — to provision a field but keep it non-editable in forms, use `enabled: false`.

### Diff behavior

New list → `createList` + `addField`s (all lists created before any fields, so cross-list
lookups resolve). Added/removed/changed field → `addField`/`dropField`/`alterField`. Index change
→ `addIndex`/`dropIndex`, for a navigation's lookup column as much as for a scalar. Renames are never inferred (drop + add) — hand-merge with
`renameField`/`renameList` after generation.

### Migrator wiring

Construct a `Migrator` with your `DbContext`, a schema provider, and the `migrations` array.
The `schema` is the only environment-specific piece — swap `useSharePointSchema` for a fake in
tests. See [runtime.md](runtime.md) for the full `Migrator` API.

## Boundaries & gotchas

- The snapshot is the source of truth for "what the model looked like last time." Commit it every
  time you run `add` — the next run depends on it.
- `remove` only deletes the _latest_ migration. To remove several, run it once per migration in
  reverse order.
- A SharePoint built-in declared _without_ `readOnly` lands in the snapshot like any other
  column, and the generated `addField` then collides with the built-in when it runs. Mark
  built-ins read-only.
- The diff never infers renames. A renamed list or field generates a `dropList`/`createList` or
  `dropField`/`addField` pair. Hand-merge into `renameList`/`renameField` _before_ committing if
  you need to preserve data.
- The config loads your TypeScript model at design time — the `DbContext` constructor must accept
  an options object (the CLI passes a stub provider). If your context does side-effectful work in
  the constructor, extract that to a separate method.
