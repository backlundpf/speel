# Schema Provider

## What & when

`SharePointSchemaProvider` is the PnPjs-backed `ISchemaProvider` from
`@speel/migrations`. It reads the live site schema in one request, then applies a
migration's operations through SharePoint's `$batch` endpoint. You wire it into a
`Migrator` via `useSharePointSchema`, then let `@speel/migrations` drive it. Reach
for this page when wiring the schema provider into your migration apply step, or
when understanding how `FieldSpec` kinds map to SharePoint field types.

For the full migrations workflow (generating migrations, applying them, rollback),
see [`../../speel-migrations/README.md`](../../speel-migrations/README.md).

## Canonical example

```ts
import { Migrator } from "@speel/migrations";
import { useSharePointSchema } from "@speel/pnpjs";
import { migrations } from "./migrations"; // generated index.ts from your project

// In onInit() — pass the SPFx context, same pattern as useSharePoint.
const schema = useSharePointSchema(this.context);

const migrator = new Migrator({
  context: ctx, // your DbContext instance
  schema,
  migrations,
});

// Check status; apply pending migrations.
const status = await migrator.status();
// { applied: [...], pending: [...] }

await migrator.migrate();
```

`useSharePointSchema` accepts the same two shapes as `useSharePoint`:

```ts
// SPFx context (common)
useSharePointSchema(this.context);

// Options object (override URL or supply pre-built SPFI)
useSharePointSchema({ spfxContext: this.context, webUrl: "…" });
useSharePointSchema({ spInstance: mySpfi });
```

## Capabilities

### `useSharePointSchema` / `SharePointSchemaProvider`

`useSharePointSchema` builds a PnPjs `SPFI` from the provided context and returns
a `SharePointSchemaProvider`. You never call the class directly — pass the result
as `schema` to the `Migrator`.

`ISchemaProvider` is two methods:

- **`readSchemaAsync()`** — every non-hidden list and its columns, in a single
  request, as a `SchemaSnapshot`.
- **`applyAsync(ops, snapshot)`** — one batch scope at SharePoint's 100
  sub-request cap. Each operation settles independently and comes back as a
  `SchemaOpResult` of `'applied'` or `'failed'`. A successful `createList` carries
  the new list's `listId`, which is what lets a later wave resolve a Lookup's
  target GUID without a second read.

The provider makes no reads of its own during apply: the snapshot supplies every
GUID it needs. Deciding _whether_ an operation should run belongs to
`@speel/migrations`, not here — the provider only ever receives work that the
snapshot says is outstanding.

### `FieldSpec` → CAML field definitions

Field creation goes through `fields.createFieldAsXml` with the whole spec in the
CAML, which is one write per column. Every field carries `Name`, `StaticName`,
`DisplayName`, `Required`, `Indexed`, and `Description`; `fieldSpecToXml` adds the
type-specific attributes:

| FieldSpec `kind`     | CAML `Type`   | Attributes                                           |
| -------------------- | ------------- | ---------------------------------------------------- |
| `Text` (single-line) | `Text`        | `MaxLength`                                          |
| `Text` (multiline)   | `Note`        | `NumLines`, `RichText`, `RichTextMode`, `AppendOnly` |
| `Number`             | `Number`      | `Min`, `Max`, `Decimals`, `Percentage`               |
| `Currency`           | `Currency`    | `Min`, `Max`, `Decimals` — site default currency     |
| `Boolean`            | `Boolean`     | —                                                    |
| `DateTime`           | `DateTime`    | `Format`, `FriendlyDisplayFormat`                    |
| `Choice`             | `Choice`      | `FillInChoice`, `Format`, `<CHOICES>` children       |
| `Choice` (multi)     | `MultiChoice` | `Mult`, `FillInChoice`, `<CHOICES>` children         |
| `Lookup`             | `Lookup`      | `List="{guid}"`, `ShowField`                         |
| `Lookup` (multi)     | `LookupMulti` | Adds `Mult`                                          |
| `User`               | `User`        | `UserSelectionMode`                                  |
| `User` (multi)       | `UserMulti`   | Adds `Mult`                                          |

`alterField` is the one path that still uses `field.update()`, via
`fieldSpecToUpdate` — a MERGE of the attributes SharePoint accepts after
creation.

Creation passes `Options: AddFieldOptions.AddFieldInternalNameHint`, which is
what makes SharePoint treat the CAML's `Name` as the internal name. See the
gotcha below — this is not optional.

### Idempotency

The provider is not idempotent and does not try to be. `@speel/migrations` diffs
each operation against the snapshot and drops what is already satisfied, so
re-running a migration after a partial failure is safe. See the migrations
runtime page for the exact skip rules.

### Recycle on list drop

`dropList` calls PnPjs `.recycle()`, not `.delete()`. A dropped list is moved to
the site recycle bin (recoverable for ~90 days). Field drops are permanent.

## Boundaries & gotchas

- **`@speel/migrations` is an optional peer.** All imports from it are type-only.
  The schema provider code is safe to bundle when you have not installed
  `@speel/migrations`, but the `ISchemaProvider` type won't resolve — only install
  and call `useSharePointSchema` when you are using `@speel/migrations`.

- **A batch is not a transaction.** `$batch` applies operations independently, so
  a failure leaves the operations beside it committed. `applyAsync` reports every
  outcome; it never throws on a single bad op.

- **`createFieldAsXml` needs `AddFieldInternalNameHint`.** Without `Options: 8`,
  SharePoint derives a new column's internal name from `DisplayName` and treats
  the CAML's `Name` as advisory — a field displayed as "Action Items" is created
  as `Action_x0020_Items`. PnPjs's string overload
  (`createFieldAsXml(xml)`) sends no `Options` at all, so field creation must
  pass the object form. Internal names are immutable, so a column created
  without the flag has to be dropped and re-added, not renamed.

- **Queue synchronously.** PnPjs enrols a request in a batch at invoke time. Any
  `await` between opening the scope and calling `execute()` silently drops the
  requests that follow it. This is why `applyAsync` maps over its ops without
  awaiting.

- **`maxRequests` must be passed explicitly.** `@pnp/sp` defaults it to 20 and
  issues one sequential POST per chunk, so a 100-operation batch becomes five
  round trips unless you say otherwise. Both this provider and `SharePointProvider`
  pass 100.

- **Three specs reach SharePoint that previously did not.** `Number.decimalPlaces`,
  `Number.showAsPercentage`, and `DateTime.friendlyFormat` were silently dropped by
  the old creation path. Columns provisioned now will differ from columns
  provisioned by earlier versions.

- **Currency locale is not forwarded.** SharePoint's `CurrencyLocaleId` expects a
  numeric LCID, not a code like `'USD'`. The column takes the site's default
  currency. `FieldSpecBase.default` is likewise not yet wired.

- **`ShowField` is Lookup-only.** SharePoint defaults a person column to
  `ImnName`, and `FieldSpecBuilder` defaults `showField` to `'Title'`, so emitting
  it for `User` would change how every person column renders.

- **Lookup targets resolve from the snapshot.** A Lookup whose target list is
  absent from the snapshot fails that operation with a named error rather than
  guessing. A list created earlier in the same migration is available, because the
  Migrator folds each wave's results back into the snapshot before the next.

- **Field alter does not change type or cardinality.** You cannot change a
  Lookup's target list or a User field's cardinality in place; those require a
  drop + add.
