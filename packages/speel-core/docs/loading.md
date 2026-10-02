# Loading related data

## What & when

Navigations are never loaded automatically: a query returns the entities you asked for, with
their navigation properties empty until you say otherwise. `include` loads a navigation with
a further request to the related list and stitches the results by FK; `expand` resolves a
person navigation inline on the same request; `thenInclude` reaches a navigation on what was
just loaded. Reach here when a query should come back with its related rows, or when a page of
reads is slower than it should be. Declaring the navigations themselves is
[relationships.md](relationships.md); the rest of the query pipeline is [querying.md](querying.md).

## Canonical example

```ts
import {
  DbContext,
  Entity,
  ManyToOne,
  OneToMany,
  SpeelEntity,
  TextField,
  Principal,
  initSpeelDbContext,
} from "@speel/core";
import "@speel/pnpjs";

@Entity({ list: "Programs" })
class Program extends SpeelEntity {
  @TextField({ required: true }) public Title: string | null = null;
}

@Entity({ list: "Tasks" })
class Task extends SpeelEntity {
  @TextField({ required: true }) public Title: string | null = null;
  @ManyToOne(() => Program) public Program: Program | null = null;
  public ProgramId: number | null = null;
  @ManyToOne(() => Principal, { foreignKey: "OwnerId" })
  public Owner: Principal | null = null;
  public OwnerId: number | null = null;
}

class TaskContext extends DbContext {
  public tasks = this.set(Task);
}

const ctx = initSpeelDbContext(TaskContext, (b) =>
  b.useSharePoint(this.context),
);

// The lookup costs one more request; the person nav rides along inline.
const tasks = await ctx.tasks
  .where((t) => t.Title.contains("launch"))
  .include((t) => t.Program)
  .expand((t) => t.Owner)
  .toArrayAsync();
tasks[0]?.Program?.Title; // loaded
```

## Capabilities

### `include` and `expand`

Two methods load navigation properties alongside the primary query:

- **Lookup navs** (FK-backed, declared with `hasOne`/`hasMany`) — use **`include(e => e.Nav)`**.
  The query issues a further request to the related list and stitches results by FK.
- **Person navs** (a target on a provider source — `@speel/core`'s `Principal`,
  `SiteUser`, `SiteGroup`, or a subclass) — **either method works**. `expand(e => e.Nav)`
  resolves the nav inline on the same request, but an inline person `$expand` answers
  only `Id`, `Title`, `LoginName` and `Email` — the provider projects those and drops
  the rest rather than fail the query — so `PrincipalType` stays `undefined`.
  `include(e => e.Nav)` spends one extra request on the target's own source (the User
  Information List for a `Principal` nav) and adds `PrincipalType`, on single- and
  multi-value person fields alike. Prefer `expand` for display-only reads, `include`
  when you branch on user vs group — or when a foldered save of the same items follows,
  since an `include` that returned logins is what warms the provider's login cache those
  writes resolve through (see the pnpjs [principals page](../../speel-pnpjs/docs/principals.md)).

  `include` carries whatever the target's source does: a nav declared against
  `SiteGroup` comes back with `Description` and `OwnerTitle` (`web/siteGroups` is the
  only place they exist), one against `SiteUser` with SharePoint's own `PrincipalType`
  (a claims security group reads `4` there, `8` on `principals`). `expand` reaches none
  of that — the inline expand always answers from the User Information List.

```ts
// Lookup nav: include() — a second request to the related list
const items = await ctx.tasks.include((e) => e.Program).toArrayAsync();

// Person nav, display only: expand() resolves inline, no extra round trip
const projects = await ctx.projects.expand((p) => p.Owner).toArrayAsync();

// Person nav, when you need PrincipalType: include() reads the target's own source
const owned = await ctx.projects.include((p) => p.Owner).toArrayAsync();

// Mixed on one query — Lookup navs plus a person nav
const full = await ctx.projects
  .include((p) => p.Program)
  .include((p) => p.Tags)
  .expand((p) => p.Owner)
  .toArrayAsync();
```

Chain `.thenInclude(related => related.DeepNav)` after `include` to load a
navigation on the included Lookup type (nested expand). Multiple navigations can
be loaded with consecutive calls:

```ts
// Nested Lookup: task → Program → Category
const items2 = await ctx.tasks
  .include((e) => e.Program)
  .thenInclude((p) => p.Category)
  .toArrayAsync();
```

The `thenInclude` selector is typed to what the preceding call loaded — the
element type for a collection navigation, the target itself for a reference —
so no cast is needed at any depth.

**Includes cost one round trip per depth, not per navigation.** Navigations
resolve breadth-first — everything at the same level of the include tree is
fetched together, however many branches it spans:

```ts
const items3 = await ctx.tasks
  .include((e) => e.Comments)
  .thenInclude((c) => c.Attachments)
  .include((e) => e.Program)
  .toArrayAsync();
// 1. Tasks   2. Comments + Programs   3. Attachments
```

Adding a sibling `include` to an existing depth is close to free; adding a
`thenInclude` costs a round trip. Sibling navigations that resolve against the
same target — two lookups into one list, two person fields — are de-duplicated
into a single request for the union of their ids. Providers implementing the
optional read-batch capability (`@speel/pnpjs` does) collapse each level into
one HTTP `$batch`; others run the level's reads concurrently. See
[providers.md](providers.md).

## Boundaries & gotchas

- **No cross-list JOIN.** SharePoint has no server-side join. `include` resolves
  navigations by issuing further requests to the related lists — not a joined
  query. For heavy relational reads, consider `@speel/core`'s caching layer;
  see [caching.md](caching.md).

- **The first read of a shared entity wins its column values.** When one entity
  is reachable through two navigations, the identity map hands both of them the
  same instance — but if those navigations' targets select different column
  sets, whichever level's read landed first is the one that populated it. Load
  such an entity through the navigation whose projection you need.
- **An untracked query still shares within itself.** Under `asNoTracking()` an included
  record materializes once per include level, so parents sharing an FK on one navigation get
  the same untracked instance — mutating it through one parent shows through the other.
