# Migrator runtime

## What & when

Use this page when you need to understand how the `Migrator` applies, tracks, and rolls back
migrations at runtime — its three methods, how history is stored, per-environment tracking,
idempotency, and failure behavior.

## Canonical example

Wiring a `Migrator` and calling the three methods:

```ts
import { Migrator } from "@speel/migrations";
import { useSharePointSchema } from "@speel/pnpjs";
import { migrations } from "./migrations"; // generated index

const migrator = new Migrator({
  context: ctx, // your DbContext
  schema: useSharePointSchema(spfxContext), // PnPjs-backed schema provider
  migrations, // ordered array from generated index
});

// Inspect state. Creates SpeelMigrationsHistory if the site has none yet.
const { applied, pending } = await migrator.status();

// Preview what migrate() would do, annotated with what already exists on the site.
const { steps } = await migrator.plan({ annotate: true });

// Apply all pending migrations.
const result = await migrator.migrate();
console.log("ran", result.ran);

// Roll back to a specific point (down to target, exclusive).
await migrator.migrateTo("20260608T1816_InitialSchema");

// Roll everything back.
await migrator.migrateTo("0");
```

## Capabilities

### `status()`

Returns `{ applied: string[]; pending: string[] }`. Both arrays contain migration ids in
id order. Calls `bootstrap()` to ensure the history list exists before querying.

### `migrate(options?)`

Applies every pending migration's `up`, in id order. Skips any id already in the history list.
Returns `{ direction: 'up'; ran: string[]; log: string[] }`. Safe to call on an already-current
site — it is a no-op when there are no pending migrations. `options.onProgress` streams the run
as it happens (below).

### `migrateTo(targetId, options?)`

Moves the schema to the specified migration. Takes the same `onProgress` as `migrate()`. Pass a migration id to target that point, or `'0'`
to roll everything back.

- If the target is ahead of the current state, applies `up` migrations from the current position
  up to (and including) the target, ascending.
- If the target is behind the current state, applies `down` migrations from the current position
  down to (but not including) the target, descending.
- Throws if `targetId` is not a known id and is not `'0'`.

Returns `MigrateResult` with `direction`, `ran`, and `log`.

### Progress (`onProgress`)

Both `migrate()` and `migrateTo()` accept `{ onProgress }` and call it as the run unfolds, so a
long apply can say what it is doing rather than only what it did:

```ts
await migrator.migrate({ onProgress: (e) => console.log(e.kind, e) });
```

The stream is bracketed per migration — `migration-start` / `migration-done`, each carrying the id
and direction — with `step-start` / `step-done` in between, one pair per operation, summarised in
the same plain language `plan()` uses. A `step-done` reports `applied`, `skipped` (already
satisfied, so nothing was sent and no start was reported) or `failed` with its message. A step that
may lose data carries its `warning` on both events (see below).

Steps start a **wave at a time**, because a wave is one batched request: its operations are in
flight together and finish together. That is what buys the thing worth having — whatever is stuck
is named while it is stuck. Custom `run` steps are bracketed individually and report `failed`
before their error propagates, a data step being the likeliest thing to hang.

Nothing is buffered. `@speel/react`'s `MigrationsManager` passes its own collector, so an admin
panel gets this with no wiring — see
[`../../speel-react/docs/migrations-ui.md`](../../speel-react/docs/migrations-ui.md).

### `plan(options?)` — dry run

Returns the operations `migrate()` / `migrateTo()` _would_ run, without running them. Three modes:

- `plan()` — every pending migration's `up`, mirroring `migrate()`.
- `plan({ only: id })` — one migration's `up`, whatever its applied state. Steps report
  `willRun: false` when it is already applied.
- `plan({ to: id })` — mirrors `migrateTo(id)`, up or down (never both, matching `migrateTo`'s
  own either/or behaviour).

Each step carries a human `summary`, `willRun`, a `destructive` flag (`dropList` / `dropField`),
a `warning` when it may lose data, and `opaque` for custom `run` steps, whose `source` is included
for display.

### Data-loss warnings

An `alterField` that changes a column's type in a narrowing direction may lose data: Note → Text
truncates every value to 255 characters, Text → Number drops what does not parse, MultiChoice →
Choice keeps one selection. The Migrator judges each against the column's live type — `plan()`
sets the step's `warning`, and at apply time the step's events carry it, `MigrateResult.log` gets a
`warn <migrationId> <summary>: <message>` line and `console.warn` logs it. **The step still runs**:
the warning is for the admin, not a gate. Widenings (Text → Note, Number → Currency, anything →
Note from a single-valued scalar, single → multi) stay silent.

Adding `annotate: true` fills in each step's `presence` — `'present'` / `'absent'` / `'unknown'`.
It costs no extra requests: every command already reads the live schema once into a snapshot, and
annotation is a lookup in that snapshot. This is what makes a baseline check possible: preview a
migration whose schema you believe already exists and confirm every step reports `'present'`.

### `markApplied(id)`

Records a migration in the history list **without running its operations** — for a baseline whose
schema already exists on the target site. Idempotent; throws on an unknown id. Preview with
`plan({ only: id, annotate: true })` first and confirm every step reads `'present'`.

### History tracking (`SpeelMigrationsHistory`)

The `Migrator` creates and manages a `SpeelMigrationsHistory` list on the target site. This list
is **private to `@speel/migrations`** — it never appears on your `DbContext` and you should not
query or modify it directly. It stores one row per applied migration with `MigrationId` (Title)
and `AppliedUtc`.

Pass `historyList` to name it something else — `new Migrator({ …, historyList: '_MigrationsHistory' })`.
Choose it once, before the first apply: the title is how the store finds its rows, so renaming a
site's history list afterwards reads as an empty history and every applied migration looks pending.
`historyList` is ignored when you supply your own `history` store.

Each history row is written _after_ the migration's ops complete successfully. Each site (dev /
test / prod) keeps its own history, so an id pending on prod after applying on dev is normal.

### Batching

Every command opens with one read of the live schema. Each migration's operations are then split
at `run` steps and grouped into **waves** — runs of operations with no dependency on anything
created earlier in the same wave — and each wave is sent as a single batch.

The split rule is narrow: an operation opens a new wave only when it touches a list that an
earlier operation _in the current wave_ creates or renames into. SharePoint cannot reference an
entity created earlier in the same changeset, and a Lookup additionally needs its target's GUID,
which the server has not assigned yet. Author order is never rearranged.

A migration that creates lists and then adds columns to them is two waves. One that only adds
columns to lists that already exist is one. In practice a baseline of a dozen lists and ninety
columns costs about five requests end to end, against one per operation before.

`MigrateResult.log` records skipped operations as `skip <migrationId> <summary>` lines alongside
the `up` / `down` entries. A type-changing `alterField` goes out on its own after the batch — see
schema.md.

### Idempotency

Operations are diffed against the snapshot before they are sent, so re-running `migrate()` on a
site where operations completed but the history row was not written will only send what is
genuinely missing.

Existence-decidable operations are skipped when satisfied: `createList` when the list is present,
`dropList` when it is already gone, `addField` when the column exists, `dropField` when it does
not, `renameList` when the source title is gone, and `addIndex` / `dropIndex` when the index state
already matches.

Two are never skipped. `alterField` is a MERGE whose full shape the snapshot cannot verify, and
`renameField` sets the _display_ title, which a snapshot keyed by internal name does not track.
Re-sending either is harmless; a false skip would silently leave a column wrong.

Index operations against a column that does not exist are **not** treated as satisfied. They are
sent and fail loudly, because a migration indexing a missing column is a bug.

See [`../../speel-pnpjs/docs/schema.md`](../../speel-pnpjs/docs/schema.md) for how each operation
reaches SharePoint.

### Rollback semantics

`migrateTo` runs each `down` body in descending order and removes the corresponding history row.
`dropList` in a `down` body recycles the list rather than permanently deleting it (recoverable for
~90 days). `dropField` is permanent. See schema.md for recycle-on-drop details.

**Drop order caveat:** When rolling back multiple migrations in a single `migrateTo` call, `down`
bodies execute in reverse id order (descending). If two migrations create lists with cross-list
lookups, the automatic order may attempt to drop a list that another list's field still references.
Hand-order `dropField` before `dropList` in those `down` bodies.

### Mid-migration failure

If a migration's operations fail, its history row is _not_ written — it remains pending.
Re-running `migrate()` after fixing the underlying issue retries from that migration, and the
snapshot diff means only the genuinely missing operations go out again.

A batch is not a transaction. Every operation in a wave is sent together, so a bad operation does
**not** stop the ones beside it — those commit. What it stops is the next wave, which by
construction depended on it. The failure surfaces as a `MigrationApplyError` carrying
`migrationId` and a `failures` array of every failed `SchemaOpResult`, so one run reports all the
bad operations rather than one per deploy.

### Admin UI

The `MigrationsManager` component in `@speel/react` (`import { MigrationsManager } from
"@speel/react/migrations"`) lists every migration with Applied/Pending status, per-row
Apply/Restore actions, and a `plan()`-driven preview with Mark applied inside it. See [`../../speel-react/docs/migrations-ui.md`](../../speel-react/docs/migrations-ui.md) for
setup and customization.

## Boundaries & gotchas

- **Relationships provision under the navigation name.** A `hasOne(Owner)…hasForeignKey(OwnerId)`
  is provisioned as a field named `Owner` — a User field when the target is a provider-source
  entity (`@speel/core`'s `Principal`, `SiteUser`, `SiteGroup`, or a subclass), a Lookup otherwise;
  SharePoint auto-generates the `OwnerId` companion. Don't expect an `OwnerId` field on the
  list, and don't expect the principal entity itself to be provisioned — it is not a list.
  `isIndexed()` on such a navigation indexes that same lookup column, not the `OwnerId`
  companion: the companion is SharePoint's, and the lookup is the column a view filters on.
- **`Title` customization** (`required`/`maxLength` on the built-in `Title`) isn't re-applied —
  `addField` is idempotent on the existing column.
- **Conditional `isRequired`** (a predicate) provisions as _not_ required — SharePoint cannot
  express conditional required constraints.
- **Currency fields** provision with the site default currency — the model's `currencyCode` is a
  display hint, not the numeric `CurrencyLocaleId` SharePoint needs to create the column.
- **Lookups require title-addressed target lists.** The target list must already exist and be
  addressable by `Title` at provision time.
- **The history list is private.** Do not model it in your own `DbContext` or delete rows manually
  — doing so corrupts the applied/pending state. Its title is yours to choose via `historyList`,
  but only before the first apply; changing it later loses the history.
- **`plan()` is read-only, with one exception.** Like `status()`, it calls `bootstrap()`, which
  creates `SpeelMigrationsHistory` if it is missing. On a production site the first preview is
  therefore the call that creates that list — sequence it deliberately.
- **Presence annotation is existence-only.** The snapshot answers "does this list/field exist" and
  "is it indexed", not "does its shape match" — a `'present'` field may still have the wrong type.
  Only custom `run` steps report `'unknown'`.
- **Data-loss warnings judge type changes only.** A shorter `maxLength` or a removed choice on the
  same type is not detected, and a column the snapshot does not hold is not judged.
- **A failed migration leaves more behind than a sequential one would.** Operations in the failing
  wave are already committed. This is what makes the retry cheap rather than a problem, but it does
  mean the site is further along than the history list suggests. Preview with
  `plan({ annotate: true })` before retrying if you need to see exactly where it stopped.
- **Progress events are a live view, not a record.** They are emitted as the run goes and kept
  nowhere; a consumer that wants a transcript keeps one. A run that throws sends no
  `migration-done`, so a consumer closing something per migration closes it on the error too.
- **Custom `run` steps cannot be previewed.** They are arbitrary code, and they share one `state`
  bag across a migration, so a plan reports them opaquely rather than guessing at their effects.
- For field-type details and SharePoint mapping, see
  [`../../speel-pnpjs/docs/schema.md`](../../speel-pnpjs/docs/schema.md).
