# @speel/core

An EF-Core-style data layer for SharePoint in SPFx — model list items as typed entity classes,
track changes, query with a fluent filter builder, and persist with a single `saveChangesAsync()`.
The core is provider-agnostic; `@speel/pnpjs` supplies the SharePoint provider backed by PnPjs v4.
`@speel/migrations` handles list schema provisioning, and `@speel/react` provides Fluent v8 UI
components wired to the same context.

## Install

```bash
npm install @speel/core@beta @speel/pnpjs@beta @pnp/sp @pnp/queryable @pnp/logging
```

`@speel/core` itself has no PnPjs dependency. The `@pnp/*` peers are required by `@speel/pnpjs`.

## Quickstart

```ts
import { DbContext, ModelBuilder, initSpeelDbContext } from "@speel/core";
import "@speel/pnpjs"; // registers DbContextOptionsBuilder.useSharePoint

class Blog {
  Id?: number;
  Title?: string;
  Status?: "Draft" | "Published";
}

class BlogContext extends DbContext {
  public blogs = this.set(Blog);

  protected onModelCreating(builder: ModelBuilder): void {
    builder.entity(Blog, (b) => {
      b.toList("Blogs");
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasMaxLength(255);
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Draft", "Published"]);
    });
  }
}

// In a WebPart's onInit():
const ctx = initSpeelDbContext(BlogContext, (b) =>
  b.useSharePoint(this.context),
);

// Add and save
const post = new Blog();
post.Title = "Hello";
post.Status = "Draft";
ctx.blogs.add(post);
await ctx.saveChangesAsync();

// Query
const drafts = await ctx.blogs
  .where((b) => b.Status.eq("Draft"))
  .orderBy((b) => b.Title, "asc")
  .toArrayAsync();
```

## Conventions

**EF-Core-style, not EF Core.** The shape carries over: `DbContext` / `DbSet` / `ModelBuilder`,
change tracking, `saveChangesAsync()`, navigation properties (`hasOne` / `hasMany`), and
`onModelCreating` as the single configuration site. What is deliberately different:

- **No LINQ.** Filters use a fluent builder: `b.Status.eq('Draft')`, `and(b.X.gt(0), b.Y.ne(null))`.
  There are no JavaScript `===` predicates — the builder emits an OData query to SharePoint.
- **No lazy loading.** Navigations are loaded only when you call `.include(e => e.Nav)` or
  `.expand(e => e.Nav)` on a query — lookups take `include`, person fields take either —
  or through a cache expand configured on the model.
- **No provider-side joins.** SharePoint has no cross-list JOIN; relationships are resolved by a
  second lookup or include after the primary query.
- **SharePoint list semantics.** `Id` is the key (server-assigned integer). `Created`,
  `Modified`, `Author` and `Editor` are read-only server-managed members — `SpeelEntity`
  declares them (`Author`/`Editor` navigate to core's `SiteUser`), and setting them has no effect.
- **Two authoring paths, one model.** Decorators on the entity class (`@Entity`, `@TextField`,
  …) or the fluent builder in `onModelCreating`; they interoperate, and a subclass inherits its
  base class's declarations either way.

**Import traps agents get wrong:**

1. `import '@speel/pnpjs'` must appear before calling `initSpeelDbContext` — the import registers
   `useSharePoint` on `DbContextOptionsBuilder` via module augmentation.
2. `isChoice()` requires an options source immediately after — `.hasOptions([...])`, a
   `({ db })` thunk, or `.hasOptionsQueryAsync(...)` — the builder throws when the model is
   built (at context construction) if none is provided.
3. Field-state predicates receive a `FieldContext`, not the entity directly.
   `(c) => c.values.Status === 'Published'` is correct; `(p) => p.Status === 'Published'` is the
   old (removed) shape.

## Topic pages

- [Modeling](docs/modeling.md) — read when declaring entity classes, mapping list columns,
  configuring field types, or adding validations.
- [Querying](docs/querying.md) — read when filtering, ordering, paging, or opting out of
  change tracking with `asNoTracking`.
- [Loading related data](docs/loading.md) — read when a query should come back with its
  navigations (`include`, `thenInclude`, `expand`), or a read takes too many round trips.
- [Saving](docs/saving.md) — read when adding, updating, or removing items, or when you need
  to understand change tracking and the save cycle.
- [Files and folders](docs/files.md) — read when an entity lives in a document library, items
  belong in folders, or a file must be uploaded, renamed, copied, checked in, or deleted.
- [Scopes](docs/scopes.md) — read when one save must not commit the context's other pending
  changes (`db.createScope()`).
- [Relationships](docs/relationships.md) — read when declaring `hasOne`/`hasMany` navigations,
  inferring FK columns, or understanding nav fixup on save.
- [JSON shapes](docs/shapes.md) — read when a structured value belongs inside its row — a
  checklist, an address — rather than in a list of its own (`@JsonShape`, `@JsonField`).
- [Forms](docs/forms.md) — read when driving a form from entity metadata: field visibility,
  enabled state, and validation errors.
- [Selection options](docs/selection.md) — read when a Choice or lookup needs options loaded
  at runtime, a server-side search, or a way to add a value that is not in the list.
- [Permissions & principals](docs/permissions.md) — read when modelling a person column,
  subclassing `SiteUser`/`Principal` for your own principal type or re-pointing `Author`, or
  looking for where item-level permissions went (`@speel/identity`).
- [Caching](docs/caching.md) — read when enabling `cacheAsync()` for offline-first or
  low-latency reads with `InMemoryCacheProvider` or `IndexedDbCacheProvider`.
- [Providers](docs/providers.md) — read when implementing or swapping the storage contract
  (`IStorageProvider` plus the `IFileSystem`/`IChangeFeed` capabilities), or understanding how
  the core delegates I/O.

## Reference app

[`../../samples/spfx-sample`](../../samples/spfx-sample)
