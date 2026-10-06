# Querying

## What & when

The query pipeline lets you filter, order, page, and load navigations against a
SharePoint list without writing OData strings by hand. Every `DbSet<T>` is a query
root: call `where`, `orderBy`, `skip`/`take`, `include`, and `expand` to build up
the query, then materialise it with a terminal (`toArrayAsync`, `firstOrDefaultAsync`,
`countAsync`, etc.). Reach for this page whenever you need to filter results, page
through a large list, load related entities, or opt out of the identity map for a
read-only projection.

## Canonical example

```ts
import {
  DbContext,
  ModelBuilder,
  SpeelEntity,
  initSpeelDbContext,
  and,
  or,
} from "@speel/core";
import "@speel/pnpjs";

class Program extends SpeelEntity {
  public Title: string | null = null;
}

class Task extends SpeelEntity {
  public Title: string | null = null;
  public Status: "Open" | "In Progress" | "Done" | null = null;
  public DueDate: Date | null = null;
  public ProgramId: number | null = null;
  public Program: Program | null = null; // Lookup navigation — loaded via include()
}

class TaskContext extends DbContext {
  public tasks = this.set(Task);
  public programs = this.set(Program);

  protected override onModelCreating(builder: ModelBuilder): void {
    builder.entity(Program, (b) => {
      b.toList("Programs");
      b.property((e) => e.Title)
        .isText()
        .isRequired();
    });
    builder.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Title)
        .isText()
        .isRequired();
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "In Progress", "Done"]);
      b.property((e) => e.DueDate)
        .isDateTime()
        .asDateOnly();
      b.hasOne(Program, (e) => e.Program)
        .withMany()
        .hasForeignKey((e) => e.ProgramId);
    });
  }
}

// In a WebPart's onInit():
const ctx = initSpeelDbContext(TaskContext, (b) =>
  b.useSharePoint(this.context),
);

// Filter + order + page
const urgent = await ctx.tasks
  .where((b) =>
    and(
      or(b.Status.eq("Open"), b.Status.eq("In Progress")),
      b.DueDate.le(new Date()),
    ),
  )
  .orderBy((b) => b.DueDate, "asc")
  .take(50)
  .toArrayAsync();

// Count only — does not materialise entities
// Note: countAsync() and anyAsync() ignore take/skip; the count is always over the full filter.
const openCount = await ctx.tasks
  .where((b) => b.Status.eq("Open"))
  .countAsync();

// Look up by id — bypasses query pipeline, hits identity map first
const task = await ctx.tasks.findAsync(42);

// Read-only projection — fresh instances, identity map bypassed
const snapshot = await ctx.tasks
  .where((b) => b.Status.eq("Done"))
  .asNoTracking()
  .toArrayAsync();
```

## Capabilities

### Fluent pipeline

A query is built incrementally; each method returns a new immutable `Query<T>`
so partial queries can be reused without side effects.

**Filtering** — `where((b) => …)` accepts a predicate that returns a `FilterNode`.
Call `where` multiple times; each call ANDs with the previous filter. Use the
`and`, `or`, and `not` combinators (importable from `@speel/core`) to compose
across fields:

```ts
import { and, or, not } from "@speel/core";

ctx.tasks.where((b) => and(b.Status.eq("Open"), not(b.DueDate.isNull())));
ctx.tasks.where((b) => or(b.Status.eq("Open"), b.Status.eq("In Progress")));
```

**Ordering** — `orderBy((b) => b.Field, 'asc' | 'desc')` sets the primary sort.
`thenBy((b) => b.Field, 'asc' | 'desc')` appends a secondary (or further)
sort key. `thenBy` throws `InvalidOperationException` if called before `orderBy`.

**Paging** — `take(n)` caps the result count; `skip(n)` offsets from the start.
Combine them for offset paging: `.skip(page * size).take(size)`.

**Terminals** — execute the query and return results:

| Terminal                 | Returns                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| `toArrayAsync()`         | `T[]` — all matching items                                       |
| `firstOrDefaultAsync()`  | `T \| null` — first match or null                                |
| `singleOrDefaultAsync()` | `T \| null` — exactly-one match or null; throws if more than one |
| `countAsync()`           | `number` — count without materialising entities                  |
| `anyAsync()`             | `boolean` — true if at least one match exists                    |

`findAsync(id)` on `DbSet` is a separate, non-chainable shortcut that checks the
identity map before hitting SharePoint — useful when you already have an id.

### Filter operator catalog

| TS type                  | Operators                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `string` / Choice        | `eq`, `ne`, `startsWith`, `endsWith`, `contains`, `in`, `notIn`, `isNull`, `isNotNull` |
| `number` / Currency      | `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `between`, `in`, `notIn`, `isNull`, `isNotNull`    |
| `boolean`                | `eq`, `ne`, `isTrue`, `isFalse`, `isNull`, `isNotNull`                                 |
| `Date`                   | `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `between`, `isNull`, `isNotNull`                   |
| `string[]` (MultiChoice) | `contains`, `containsAny`, `containsAll`, `isEmpty`, `isNotEmpty`                      |

The TypeScript type of the property gates which operators appear in autocomplete
— the compiler rejects `b.DueDate.startsWith(…)` because `startsWith` is not
on the `Date` filter type. `isNull` / `isNotNull` are universal. `between` is
**inclusive of both bounds** (desugars to `ge lower AND le upper`).

Filtering through a **reference navigation** is supported — the builder descends
into the related type automatically when the nav is concretely typed, emitting
OData slash-path syntax:

```ts
// No cast needed when Owner is typed as a concrete class (e.g. Principal | null).
ctx.projects.where((p) => p.Owner.Title.startsWith("Jane"));

// Cast to any only when the nav property is typed `unknown`.
ctx.tasks.where((b) => (b.AssigneeUntyped as any).Title.startsWith("Jane"));
```

> Stability: still settling. When a nav property is typed `unknown`, a cast to
> `any` is required at the boundary. Type your navs concretely and no cast is
> needed — `FilterBuilder<T>` descends `object`-typed properties automatically.

### Folder scoping

On a foldered list, scope a query to one folder — or its subtree — from inside
the builder:

```ts
ctx.artifacts.where((b) => b.inFolder("reports", { recursive: true }));
```

Paths are list-relative, like the `folder` add-option; omit `recursive` for
direct children only. Queries return **items only** by default — SharePoint
interleaves folder rows with items, and those rows are excluded everywhere
unless you opt in with `b.includeFolders()` (folder rows then carry
`FSObjType === 1` on `SpeelEntity`).

### Loading navigations

`include(e => e.Nav)` loads a lookup navigation with a further request to the related list;
`expand(e => e.Nav)` resolves a person navigation inline; `thenInclude` goes deeper. How
they cost, batch, and choose between them is on [loading related data](loading.md).

### `asNoTracking`

`asNoTracking()` returns fresh entity instances that are **not entered into the
identity map**. Even if an entity with the same `Id` is already tracked, a
separate untracked copy is returned. Use this for read-only views where you do
not intend to call `saveChangesAsync`, and for large result sets where
identity-map overhead isn't wanted. Tracked and untracked instances for the same
`Id` can coexist; the change tracker ignores untracked instances entirely. Within
one query an included record still materializes **once** per include level:
parents sharing an FK on one navigation get the same untracked instance.

## Boundaries & gotchas

- **No default result cap.** `toArrayAsync()` paginates internally until
  SharePoint returns no more items — it will attempt to fetch every item in a
  large list. Use `.take(n)` to cap explicitly. On lists with thousands of items,
  combine `.where(…)` and `.take(n)` to avoid throttling.

- **`countAsync` and `anyAsync` ignore `take`/`skip`.** These terminals count
  over the full filter regardless of any paging set on the query chain.
  `.take(10).countAsync()` still returns the count of all matching items, not 10.
  Counts are also items-only by default: an unfiltered `countAsync()` iterates
  rather than reading SharePoint's cheap `ItemCount` (which counts folder rows);
  `.where((b) => b.includeFolders()).countAsync()` restores the fast path.

- **Unstable ordering without `orderBy`.** SharePoint returns its default list
  order when no `orderBy` is specified. `firstOrDefaultAsync` and paged queries
  without an explicit `orderBy` may return inconsistent results across calls.

- **`containsAll` on MultiChoice throws at translation.** The OData filter
  dialect SharePoint uses has no clean representation for "field contains every
  value in a set." Calling `containsAll` emits a `QueryTranslationException`
  at query execution time. Use `containsAny` or a sequence of `contains` calls
  combined with `and` if you need multi-value intersection.

- **Collection navigations cannot be filtered in `where`.** Descending through
  a reference navigation (`b.Author.Title.eq(…)`) works; trying to traverse a
  collection nav throws a `ModelConfigurationException` at query-build time.
  There is no `b.Comments.Body.contains(…)` equivalent.

- **`thenBy` before `orderBy` throws.** `thenBy` requires at least one `orderBy`
  to have been called first on the same query chain; it throws
  `InvalidOperationException` otherwise.

- **`skip` + `take` on large lists.** SharePoint OData `$skip` can be slow on
  lists without index coverage. For forward-only paging of large results, prefer
  `take(n)` with a timestamp or id filter rather than high `skip` values.
