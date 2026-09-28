# Providers

## What & when

`@speel/core` is provider-agnostic: it defines the storage contract — `IStorageProvider`, plus
the optional `IFileSystem` and `IChangeFeed` capabilities — but contains no HTTP code. A provider
package implements what its store supports and plugs in at context construction time via
`DbContextOptionsBuilder`. Reach for this page when you are implementing a custom or fake
provider for testing, or want to understand the I/O seam before substituting a provider.

## Canonical example

The pattern every `@speel/core` unit test uses: a `FakeStorageProvider` through `useProvider`.

```ts
import { DbContext, ModelBuilder, initSpeelDbContext } from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";

class Task {
  Id?: number;
  Title?: string;
  Done?: boolean;
}

class TaskContext extends DbContext {
  public tasks = this.set(Task);

  protected onModelCreating(builder: ModelBuilder): void {
    builder.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Title)
        .isText()
        .isRequired();
      b.property((e) => e.Done).isBoolean();
    });
  }
}

// In a test — then exercise the context normally (or seed rows with provider.seedRow).
const provider = new FakeStorageProvider();
const ctx = initSpeelDbContext(TaskContext, (b) => b.useProvider(provider));
const task = new Task();
task.Title = "Write tests";
task.Done = false;
ctx.tasks.add(task);
await ctx.saveChangesAsync();
```

`useProvider` is the generic registration method on `DbContextOptionsBuilder`; it takes an
`IStorageProvider`. Its `@internal` tag signals that provider packages should wrap it in a named
method (`@speel/pnpjs`'s `useSharePoint`); core's own tests call it directly.

> Stability: still settling. `useProvider` is the only registration seam today; as an `@internal`
> member it may be hidden from rolled-up type surfaces later.

## Capabilities

**The contract is three interfaces**, and one provider object implements the ones its store
supports — `SharePointProvider` and `FakeStorageProvider` both declare
`implements IStorageProvider, IFileSystem, IChangeFeed`:

- **`IStorageProvider`** — what every store must do. Reads: point lookups by id, batched lookups
  by id set, paged queries with filter/order/skip, total counts, and navigation expansion through
  `IExpandClause`; every read names its source (a list handle or a provider-owned source) and
  takes the `properties` to return typed. Writes: one `executeBatchAsync` taking `IBatchOperation`
  items (`insert`, `update`, `delete`) whose results align to the input by `clientToken`. Plus
  two optional accelerators (below).
- **`IFileSystem`** — a store whose items live in folders and may be files: `ensureFoldersAsync`
  creates missing levels and returns server-relative URLs (backs folder placement on add);
  `uploadFileAsync` uploads content and applies typed `fields` as metadata; `renameFileAsync`,
  `copyFileAsync`, `renameFolderAsync`, `deleteFolderAsync` and `checkinFileAsync` act on what is
  there. A rename is a move within the parent; an occupied destination must fail, not overwrite.
- **`IChangeFeed`** — `getListItemChangesSinceToken` returns items modified since a prior token
  and ids deleted since; pass `''` on first load to obtain the baseline token. The cache's delta
  sync is its only consumer.

Core narrows structurally with the exported guards `hasFileSystem(p)` and `hasChangeFeed(p)`
(true when every member of the capability is a function). A call that needs a capability the
configured provider lacks throws `InvalidOperationException` naming both, before any request —
`add({ folder })` and `add({ file })`, the direct folder and file methods on `DbSet`, a foldered
insert or upload at save, and `cacheAsync()`'s sync: `add({ folder }) requires a provider with
the IFileSystem capability (folders and files); the configured provider has none.` A read, a root
insert, an update and a delete never touch a capability. `includeContainers` on a read and
`folderServerRelativeUrl` on an insert stay on `IStorageProvider`: a store without folders ignores
the first and fails an insert whose second is not `null`.

**A record handed to core belongs to core.** An implementation must not retain a reference it
later mutates or hands to another caller: core materializes entities straight from the record and
copies nothing on the way. The cache seam carries the same rule — a row an `ICacheProvider`
returns from `read` must not alias its store or another read's result ([caching.md](caching.md)).

Nothing principal- or permission-specific is on the contract: principals are read through
provider sources (below); bringing a user into the site, role definitions and assignments belong
to `@speel/identity`'s `IIdentityProvider` — see [its permissions page](../../speel-identity/docs/permissions.md).

**Optional accelerators** are members of `IStorageProvider` a provider may omit; core detects
their absence and falls back rather than failing: `maxInFilterValues`, which reports how many
values fit in one `in` filter before the request grows too long, and `executeReadBatchAsync`,
which takes `IReadOperation` descriptors and performs them in as few round trips as the backend
allows — one include depth resolves through it; without it core runs the level's reads through
the individual read methods concurrently. Implementing it means three things: results are
**complete** (an implementation that needs continuations to drain a spilled read performs them
itself), may come back in **any order** (callers match on `clientToken`), and a failure
**throws** rather than reporting per-operation status, with `clientToken` set on the error where
the failure can be attributed, so core can name the navigation behind it.

**Provider sources** are reads from something the provider owns outright rather than a list.
`ISourceHandle` is either an `IListHandle` or an `IProviderSource` — `{ kind: "provider", key }`
— and every item read and read-batch descriptor takes one; `sourceKey()` turns either into the
stable string the cache layer keys on. An entity registered against one
(`toProviderSource` / `@Entity({ source })`) is read through `EntityType.sourceHandle` — a query
on its set, `findAsync`, the `itemsByIds` behind a person navigation's `.include()` — and an
inline `$expand` of such a navigation carries the target's source on `IExpandClause.source`, so
the implementation knows it is projecting a person column and answers what the wire can
(`@speel/pnpjs`: `Id`, `Title`, `LoginName`, `Email`) rather than failing the query. Core's
canonical `Principal`/`SiteUser`/`SiteGroup` are declared against `principals`, `siteUsers` and
`siteGroups` — the keys `@speel/pnpjs` serves — and `SpeelEntity`'s `Author`/`Editor` navigate to
`SiteUser`, so their `.include()` is an `itemsByIds` read on `siteUsers`. Core knows nothing else
about what a key means: a provider source cannot be provisioned or cached, and the entity API
never inserts into it. Four rules bind every implementation — the conformance suite pins the
first three, the type pins the fourth:

1. A key the implementation does not serve throws, naming the key.
2. Records come back in the caller's column vocabulary; the implementation absorbs whatever the
   backing endpoint calls things, and translates filters and order keys the same way.
3. A selected column the key cannot carry is omitted from the record. The same column in a
   filter throws `QueryTranslationException`; in an order key it throws. A read never silently
   drops a predicate.
4. Reads only: `insert` carries an `IListHandle`, never a provider source.

**The typed boundary.** Typed values cross the provider boundary in both directions — core never
sees a wire shape — and the vocabulary is fixed per field kind:

| Kind                | Typed value                        |
| ------------------- | ---------------------------------- |
| `Text`              | `string`                           |
| `Number`/`Currency` | finite `number`                    |
| `Boolean`           | `boolean`                          |
| `DateTime`          | valid `Date`                       |
| `Choice`            | `string`, or `string[]` when multi |
| `Lookup`            | `number`, or `number[]` when multi |

_Writes_ are the `insert` and `update` batch operations, each carrying `IWriteField`s — the
model's own `Property` and the typed value. The implementation reads `property.columnName` and
`property.config` (kind, multi, a lookup's target and its source), picks its API and owns every
encoding; it never consults the property's codec or presentation members. An insert omits
unset fields; on update `null` means clear and an empty array clears a multi-value column. A
`Lookup` whose target's source is a provider source is a person column carrying the same id(s):
the implementation resolves them to whatever its write API needs, remembers each answer for the
life of the instance, and fails an id it cannot resolve as that one operation, never the batch.
`IFileUploadRequest` takes the same `fields` as metadata.

_Reads_ take `properties?: readonly Property[]` beside the `$select` field list — the item
reads, the change-token read, the read descriptors, and `IExpandClause` for the sub-records an
expand returns. The implementation types every column a property describes (matched by
`columnName`, path-shaped columns such as `File/Length` included) before returning the record; a
column no property describes, or a read that passes none, comes back as-is. Core passes the
entity's properties on every entity read and applies the user's
`hasCodec({ toProvider, fromProvider })` on top.

**Module augmentation** is how a provider package adds its own setup method to the builder
without modifying core. `@speel/pnpjs` declares `useSharePoint` through:

```ts
declare module "@speel/core" {
  interface DbContextOptionsBuilder {
    useSharePoint(spfxContext: ISPFXContext): DbContextOptionsBuilder;
  }
}
DbContextOptionsBuilder.prototype.useSharePoint = function (arg) {
  return this.useProvider(new SharePointProvider(sp)); // sp built from arg
};
```

The `import '@speel/pnpjs'` side-effect import triggers this registration, which is why it must
appear before `initSpeelDbContext`. **The shipped provider** is `@speel/pnpjs`: it wraps PnPjs v4
and is the only provider you need in production SPFx — see [its README](../../speel-pnpjs/README.md).

**`@speel/core/testing`** exports `FakeStorageProvider` — the same in-memory provider the
core test suite runs against, implementing all three parts of the contract. Import it from the
subpath and pass it via `b.useProvider(provider)`. It stores typed values and returns them;
`seedRow(list, record)` stores one typed row under a fresh id without a write op; `seedPrincipal`
takes an `IFakePrincipal` in model spelling and serves it through the three provider-source keys
exactly as `@speel/pnpjs` would — and through a person navigation's `.include()` and inline
`$expand`. `siteGroups` sees only SharePoint groups, and `principals` reports a security group as
8, because the real User Information List cannot tell them apart. The property factories
(`textProperty` … `lookupProperty`, with `stubEntityType` for a lookup target) build the
`Property` a write or a typed read needs without building a whole model.

**The conformance suite** is how two implementations of one contract stay in agreement, and it
is the reason provider logic no longer creeps into core to get tested. `@speel/core/testing`
exports `providerConformanceCases(harness)`, which returns 27 named cases — each an
`IConformanceCase` with a name and a `run()` — with no test-framework dependency, so one runner
drives them under vitest and another inside a browser page. The `IProviderConformanceHarness`
supplies a provider implementing all three interfaces (the suite exercises them all) and what
the cases refuse to take from it: a list and the model's properties for its columns, a lookup
target, a folder path, a library, three principals found by an independent route (as
`IConformancePrincipal`), an independent read-back, and a way to count principal resolves. The
cases cover the four rules, both insert paths, cold and warm principal resolution, an unknown
principal failing its own operation, a small-page drain of `siteGroups`, typed upload metadata,
and the typed boundary itself (a `Date`, a boolean and arrays round-tripped; a typed update with
a `null` clear; a multi-value clear). `FakeStorageProvider` passes in core's unit suite;
`SharePointProvider` passes live through `samples/spfx-sample` (`providerConformance.spec.ts`;
27/27 on 2026-09-15). Do both.

## Boundaries & gotchas

**`FakeStorageProvider` is available via `@speel/core/testing`.** It is intentionally excluded
from the main `@speel/core` entry point — import it from the subpath so it tree-shakes out of
production bundles. A leaner stub that implements only `IStorageProvider`, passed through
`b.useProvider(myFake)`, is correct — and is how you exercise the capability-absent path.

**`insert` addresses a list handle only.** A provider source is read-only by contract (rule 4),
so nothing creates a principal through the entity API — `DbSet.add`/`remove` on one throw before
any request. Bringing a user into the site is `identity.users.ensure`, not a write to `principals`.

**A column no property describes comes back as-is.** That is the rule for raw column reads
(`ContentTypeId`, anything a caller selects that the model does not declare) — never a fallback
for a declared column: core always passes the properties it declares, and a wire value a property
cannot explain (a non-date in a `DateTime`) must throw `DataException`, never be guessed.

**`null` means clear only on update.** An insert never carries `null` (a caller bug; the
implementation may reject one). Empty arrays are clears on update and empties on insert.

**Implementing a provider? The contract is three interfaces now.** `ISharePointProvider` is a
deprecated alias for `IStorageProvider & IFileSystem & IChangeFeed`, marked `@deprecated`;
declare `implements IStorageProvider` plus whichever capabilities the store has — `useProvider`
accepts the result, and core refuses the operations the missing ones would have served. Records
you hand to core are core's: return fresh objects, never rows a cache of your own still holds.
`SpeelEntity.Author`/`Editor` and `SpeelDocument.CheckedOutBy` are typed `SiteUser` (core's
class); the interface they used to be typed as and the principals source-key constant are gone;
a navigation re-declared by name now replaces the inherited one instead of throwing. Earlier
rounds (pre-publish, no shims): writes are typed `insert`/`update`/`delete` operations carrying
`IWriteField`s, reads take `properties` and an `ISourceHandle`, and the principal methods left
the contract for provider sources and `IIdentityProvider`. Callers through the entity API see
none of this.

**Caches written before typed values are dropped.** `IndexedDbCacheProvider` opens its database
at version 2 and deletes stores written by earlier versions on upgrade — they hold wire-shaped
records nothing coerces any more; the next `cacheAsync()` re-syncs from an empty token.

**Batch atomicity is provider-defined.** Core assembles the operation list and inspects the result
array. SharePoint's `$batch` applies operations independently — a partial failure leaves earlier
operations committed.

**No provider-side joins.** `IExpandClause` asks a provider to include related data from a
navigation column as a sub-query or OData `$expand`, not a SQL join; cross-list relationships are
resolved by further requests after the primary query — one per include depth, batched where the
provider supports it. **A batched read is not necessarily one HTTP request**: `@speel/pnpjs`
splits at SharePoint's 100-sub-request `$batch` cap and re-fetches any filtered read whose first
page might have had a successor. Count provider calls when you want a stable number.
