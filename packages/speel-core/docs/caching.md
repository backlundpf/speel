# Caching

## What & when

The caching layer lets you serve all items in a SharePoint list from a local
store — memory or IndexedDB — and sync incrementally using SharePoint change
tokens so only the diff is fetched on each call. Reach for it when you need
low-latency reads (e.g. populating a dropdown or a dashboard on every render),
when the list changes infrequently and re-querying SharePoint each time would
be too slow, or when you want a list fully available in the browser without a
live network call on every read.

Caching is completely opt-in: it requires both a model-level declaration
(`b.useCaching(...)` on the entity builder) and a context-level provider
(`b.useCaching(provider)` on the options builder). Neither alone is sufficient.

## Canonical example

```ts
import {
  DbContext,
  ModelBuilder,
  SpeelEntity,
  initSpeelDbContext,
  IndexedDbCacheProvider,
} from "@speel/core";
import "@speel/pnpjs";

class Tag extends SpeelEntity {
  public Title: string | null = null;
  public Color: string | null = null;
}

class TagContext extends DbContext {
  public tags = this.set(Tag);

  protected onModelCreating(builder: ModelBuilder): void {
    builder.entity(Tag, (b) => {
      b.toList("Tags");
      b.property((e) => e.Title)
        .isText()
        .isRequired();
      b.property((e) => e.Color).isText();

      // Opt into caching with a 60-second TTL.
      b.useCaching((c) => c.withTimeout(60_000));
    });
  }
}

// In a WebPart's onInit():
const ctx = initSpeelDbContext(TagContext, (b) =>
  b
    .useSharePoint(this.context)
    .useCaching(new IndexedDbCacheProvider({ dbName: "my-app-cache" })),
);

// First call: fetches all items from SharePoint and stores them.
// Subsequent calls within the TTL window: served entirely from IndexedDB.
const allTags = await ctx.tags.cacheAsync();
```

## Capabilities

### Enabling caching: two required wires

**Model-level opt-in** — call `b.useCaching(configure?)` inside the entity
builder in `onModelCreating`. The optional configure callback receives a
`CacheConfigBuilder` with two refinements:

- `withTimeout(ms)` — minimum interval in milliseconds between delta syncs.
  Inside this window a second `cacheAsync()` call returns the local store
  without hitting SharePoint. Omitting `withTimeout` means every call syncs
  (always-sync mode — useful for development or small lists).
- `expand(selector, fields?)` — include a navigation property in the cached
  shape. The nav is resolved via SharePoint `$expand` at sync time; subsequent
  `cacheAsync()` calls return the related entity inline without an extra
  round-trip. Pass an optional `fields` array to select only specific columns
  from the expanded type.

```ts
// Cache with a 30s TTL and pre-expand the Owner person field:
b.useCaching((c) => c.withTimeout(30_000).expand((e) => e.Owner));

// Always-sync (no TTL), no expands:
b.useCaching();
```

**Context-level provider** — call `.useCaching(provider)` on the options
builder when constructing the context. This registers the `ICacheProvider`
implementation used for all cached entities in that context:

```ts
initSpeelDbContext(MyContext, (b) =>
  b.useSharePoint(this.context).useCaching(new IndexedDbCacheProvider()),
);
```

Both wires are required. A provider without the model opt-in, or a model
opt-in without a provider, throws `InvalidOperationException` when
`cacheAsync()` is called. So does a storage provider without the `IChangeFeed`
capability — the delta sync is that capability's only consumer, and the error
names it (`@speel/pnpjs`'s `SharePointProvider` has it; see
[providers.md](providers.md)).

### Reading from the cache

Call `cacheAsync()` on the `DbSet` instead of the usual query terminals:

```ts
const items = await ctx.tags.cacheAsync();
```

`cacheAsync()` returns `T[]`. The items are **untracked** — they are not
entered into the identity map and the change tracker ignores them. Use the
normal query pipeline (`toArrayAsync`, `findAsync`, etc.) when you need
tracked entities you intend to save.

`cacheAsync()` does not support chained `where`/`orderBy`/`take`. The entire
cached list is returned; any filtering or sorting must be done client-side on
the returned array. This is intentional — the cache stores the full list so a
second `cacheAsync()` call is free.

### Sync semantics

On the **first call** for a list, `cacheAsync()` fetches all items from
SharePoint and stores a change token alongside them. On **subsequent calls**,
the coordinator checks whether a sync is due:

- If the list is **within the TTL window** (`withTimeout`), the local store is
  returned as-is — no network request is made.
- If the TTL has **expired** (or no TTL was set), `cacheAsync()` calls
  SharePoint's change-feed API with the stored token and applies only the delta
  (upserts + deletes) to the local store, then returns the updated set.

`saveChangesAsync()` automatically marks every touched list's cache stale.
This means a `saveChangesAsync()` followed immediately by `cacheAsync()` will
pick up your own write even inside the TTL window — no manual invalidation
required.

For out-of-band changes (another user's write, a flow, a "Refresh" button),
`markCacheStaleAsync()` on the `DbSet` is the same invalidation by hand: the
next `cacheAsync()` touching that list re-syncs regardless of TTL. It shares
`cacheAsync()`'s error contract (both caching wires must be set).

### Choosing a provider

**`InMemoryCacheProvider`** — stores data in a `Map` in the current JavaScript
heap. Fast, zero setup, no async overhead. Suitable for SPAs where a cold load
on each page navigation is acceptable. Data does not survive a page reload.

**`IndexedDbCacheProvider`** — persists to the browser's IndexedDB. Survives
page reloads and tab closes; the next `cacheAsync()` after a browser restart
starts from the stored token, so only the delta since the last sync is fetched.
Requires a browser environment; the constructor throws if `globalThis.indexedDB`
is not available (e.g., in a Node test). Pass a `dbName` option to namespace
the database and avoid collisions between web parts:

```ts
new IndexedDbCacheProvider({ dbName: "my-app-cache" });
```

Both providers implement `ICacheProvider`, which is the seam if you need a
custom implementation (e.g., a shared service worker cache). **The cache owns
record isolation.** A record handed to core belongs to core, and entities are
materialized straight from cached rows without copying — so a row `read` returns
must not alias the store or another `read`'s result, or two entities built from
the same row would share one `Date` and one array. `InMemoryCacheProvider`
`structuredClone`s rows on the way in and out; IndexedDB structured-clones by
construction. A third-party implementation must give the same guarantee.

## Boundaries & gotchas

- **Untracked results.** `cacheAsync()` always returns untracked entities. They
  do not appear in `ctx.changeTracker.entries()` and a `saveChangesAsync()` will
  not pick them up. To edit a cached item, call `findAsync(id)` or re-query with
  `toArrayAsync()` to get a tracked copy.

- **No per-call filtering.** `cacheAsync()` cannot be combined with `where`,
  `orderBy`, or `take`. All filtering runs client-side on the returned array.
  If you need server-side filtering with caching semantics, the caching layer is
  not the right tool — use the normal query pipeline instead.

- **Both wires must be set.** Calling `cacheAsync()` on an entity that did not
  call `b.useCaching(...)` in the model throws `InvalidOperationException`, even
  if a provider is registered. Conversely, registering a model-level opt-in but
  omitting the context-level provider also throws. The error messages name which
  wire is missing.

- **Multi-tab IndexedDB.** Each tab holds an independent `CacheCoordinator`.
  Two tabs can both sync independently against SharePoint and write to the same
  IndexedDB store. The last writer wins per record (upserts keyed by item `Id`).
  Reads in a given tab see that tab's own last-written state. There is no
  cross-tab coordination.

- **Expanded navs are cached inline.** When `expand(selector)` is used, the
  related entity's fields are stored as nested data inside each cached record.
  If the related entity changes (e.g. a person's display name updates), the
  cached copy becomes stale until the next sync. The TTL controls how long this
  stale data is served.

- **Change token and client clock.** The TTL is measured against the client
  clock (`Date.now()`), not the SharePoint server timestamp embedded in the
  change token. Clock skew between client and server does not affect correctness,
  only the TTL evaluation.

- **`structuredClone` has no polyfill in core.** `InMemoryCacheProvider` relies on
  the platform's `structuredClone` — Node 17+ and every evergreen browser have it;
  an older test runtime does not, and the first `cacheAsync()` there fails at the
  clone, not silently. Untracked results from the cache are still independent
  instances per call: mutating one never leaks into the store or a later read.
