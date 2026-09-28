# @speel/migrations

EF-Core-style **schema migrations for SharePoint**, on top of [`@speel/core`](../speel-core).
Evolve your lists and fields in lockstep with your model: a design-time CLI diffs your model
against a committed snapshot and generates `up`/`down` migration files; a runtime `Migrator`
applies pending migrations against the live site under the signed-in user, tracking what's been
applied in a history list.

| Package                                            | Role                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `@speel/migrations`                                | Runtime: the `Migrator`, the `ISchemaProvider` contract, the operation/`FieldSpec` model. Browser-safe, no PnPjs or Node deps. |
| [`@speel/pnpjs`](../speel-pnpjs)                   | The PnPjs-backed `SharePointSchemaProvider` + `useSharePointSchema(...)`.                                                      |
| `@speel/react/migrations`                          | Optional Fluent v8 admin component (`MigrationsManager`).                                                                      |
| [`@speel/migrations-cli`](../speel-migrations-cli) | Design-time CLI (`add` / `list` / `remove`) that generates migrations.                                                         |

**Scope (v1):** lists + fields (Text/Note, Number, Currency, Boolean, DateTime,
Choice/MultiChoice, Lookup, Person) + attributes (required, indexed, default, choices, max
length) + lookup/person relationships. Out of scope: content types, views, list-level settings.

## Install

```bash
npm install @speel/migrations@beta
npm install @speel/pnpjs@beta          # SharePoint schema provider (required at runtime)
npm install --save-dev @speel/migrations-cli@beta  # CLI for generating migrations
```

## The developer loop

```
1. change your model  →  2. generate a migration  →  3. commit it  →  4. apply it to each site
```

1. Add or change a property in your `DbContext` model.
2. Run `npm run migrations:add -- <Name>` — the CLI diffs the model against the committed
   snapshot and writes a migration file.
3. Commit the migration file, the rewritten `model-snapshot.json`, and the updated `index.ts`.
4. In your SPFx web part, construct a `Migrator` and call `migrate()` against the live site.

See [docs/workflow.md](docs/workflow.md) for the full end-to-end walkthrough including the config
file, generated file anatomy, and `Migrator` wiring.

## Topic pages

- [Workflow](docs/workflow.md) — read when setting up the loop for the first time or
  troubleshooting generation/apply.
- [Authoring](docs/authoring.md) — read when writing `run()` data steps, hand-merging
  renames, or looking up the full builder verb set.
- [Runtime](docs/runtime.md) — read when you need `status`/`migrate`/`migrateTo`
  semantics, history tracking, rollback behavior, or failure recovery.

## Reference app

[`../../samples/spfx-sample`](../../samples/spfx-sample)
