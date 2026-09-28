# Relationships

## What & when

Relationships wire entity classes to each other via SharePoint Lookup columns (a person
column is a lookup whose target is a principal entity). Declare them with **relationship
decorators** on the navigation property — `@ManyToOne`, `@OneToOne`, `@OneToMany`,
`@ManyToMany` — or with the fluent `hasOne` (reference nav) and `hasMany` (collection nav)
in `onModelCreating`; either way the builder infers or synthesizes the FK column. Reach for
this page when modelling parent–child links, tag joins, person navs or inverse collections.

## Canonical example

```ts
import {
  DbContext,
  SpeelEntity,
  Principal,
  Entity,
  Key,
  TextField,
  ManyToOne,
  ManyToMany,
  OneToMany,
  initSpeelDbContext,
} from "@speel/core";
import "@speel/pnpjs";

@Entity({ list: "Programs" })
class Program extends SpeelEntity {
  @Key public Id?: number = undefined;
  @TextField({ required: true }) public Title: string | null = null;

  // Inverse collection — FK lives on Project.ProgramId, named via `inverse`.
  @OneToMany(() => Project, { inverse: (p) => p.Program, readOnly: true })
  public OwnedProjects: Project[] | null = null;
}

@Entity({ list: "Tags" })
class Tag extends SpeelEntity {
  @Key public Id?: number = undefined;
  @TextField({ required: true }) public Title: string | null = null;
}

@Entity({ list: "Projects" })
class Project extends SpeelEntity {
  @Key public Id?: number = undefined;
  @TextField({ required: true }) public Title: string | null = null;

  // Lookup nav → Programs; FK inferred as ProgramId, paired with OwnedProjects above.
  @ManyToOne(() => Program, {
    inverse: (p) => p.OwnedProjects,
    required: true,
    displayName: "Program",
  })
  public Program: Program | null = null;
  public ProgramId: number | null = null; // FK (synthesized if omitted)

  // Multi-value Lookup (many-to-many) — FK is a number[] on this entity.
  @ManyToMany(() => Tag, { foreignKey: "TagsId", displayName: "Tags" })
  public Tags: Tag[] | null = null;
  public TagsId: number[] | null = null;

  // Person nav — core's Principal covers both users and groups.
  @ManyToOne(() => Principal, { foreignKey: "OwnerId", displayName: "Owner" })
  public Owner: Principal | null = null;
  public OwnerId: number | null = null;
}

// Principal joins the model by reference — a plain DbContext is enough.
class ProjectContext extends DbContext {
  public projects = this.set(Project);
  public programs = this.set(Program);
  public tags = this.set(Tag);
}

// In a WebPart's onInit():
const ctx = initSpeelDbContext(ProjectContext, (b) =>
  b.useSharePoint(this.context),
);
```

## Capabilities

### Relationship decorators

The four relationship decorators are a deferred replay of the fluent `hasOne`/`hasMany`
chain, so they share the same FK inference, inverse pairing, and save-time fixup:

| Decorator                     | Fluent equivalent               | FK lives on        | Use for                |
| ----------------------------- | ------------------------------- | ------------------ | ---------------------- |
| `@ManyToOne(() => T, opts?)`  | `hasOne(T).withMany(inverse?)`  | self               | parent ref, person nav |
| `@OneToOne(() => T, opts?)`   | `hasOne(T).withOne(inverse?)`   | the target         | 1:1 link               |
| `@OneToMany(() => T, opts)`   | `hasMany(T).withOne(inverse)`   | the child          | inverse collection     |
| `@ManyToMany(() => T, opts?)` | `hasMany(T).withMany(inverse?)` | self (multi-value) | tag-style join         |

The target is a **thunk** (`() => T`), resolved lazily at `build()` — that is what makes
circular pairs (`@OneToMany(() => Child)` ↔ `@ManyToOne(() => Parent)`) safe to declare
across module boundaries. `opts` is a `NavOptions`: the shared field-state refinements in
noun form (`required`, `displayName`, `readOnly`, …) plus `inverse` (the `withMany`/`withOne`
argument), `foreignKey` (else inferred as `NavName + 'Id'`), `displayField`, and the options
surface — `options`, `optionsQueryAsync`, `optionsQuery`, `optionsFilter`, `optionsValue`,
`optionsRender`, and `optionsCreateAsync` to create a missing target from the picker
([selection.md](selection.md)). `@OneToMany` **requires** `inverse`. Everything below
applies to both paths.

### Declaring reference and collection navs

`b.hasOne(TargetClass, (e) => e.NavProperty)` declares a to-one (reference) nav; chain
`.withMany()` when the inverse is a collection or `.withOne()` for a one-to-one whose FK
lives on the target. `b.hasMany(TargetClass, (e) => e.NavProperty)` declares a to-many nav:
`.withMany()` for a multi-value Lookup (FK is a `number[]` on the declaring entity) or
`.withOne((child) => child.RefNav)` for an inverse collection (FK on the child, pointed back
at this entity's `Id`; the argument names the child's reference nav). The optional inverse
argument pairs the two sides and enables two-phase inverse fixup on save; omitting it declares
an anonymous nav where fixup still works but the other side isn't maintained.

**The target joins the model by reference.** A target registered with `@Entity` need not be
`set()` on the context: `build()` pulls it in, transitively (`set(Review)` brings `Book` and,
through it, `Author`). A target nobody registered still throws
`NavigationConfigurationException`, and decorated entities nothing references stay out.

**Navigations merge by name — later wins.** Re-declaring a navigation an entity inherited
(a subclass's decorator, or a fluent `hasOne` over a decorator) replaces it instead of
colliding, and the include then reads the new target's source. That is how an app re-points
`SpeelEntity`'s `Author` at its own `SiteUser` subclass ([permissions.md](permissions.md)).

### FK inference and `hasForeignKey`

The builder infers the FK column name when you omit `hasForeignKey`: a reference nav named
`Program` gets FK `ProgramId` (or `hasColumnName('Owner')` → `OwnerId`); an inverse collection
infers it from the child's inverse nav name. Call `.hasForeignKey((e) => e.MyFkProp)` to
override. The FK property need not be declared via `b.property(...)` — the builder synthesizes
the column, and declaring it as a scalar too throws `NavigationConfigurationException`.

### Field refinements on relationships

`RelationshipBuilder` exposes the same field-state surface as scalar property builders
(`hasDisplayName`, `isRequired`, `isVisible`, `isEnabled`, `isReadOnly`, `isIndexed` on the
FK-owning side, `hasValidation`). They apply to the **navigation**, not the FK column:

```ts
b.hasOne(Program, (e) => e.Program)
  .withMany()
  .isRequired(true)
  .hasDisplayName("Program")
  .isEnabled((c: FieldContext<Project>) => c.values.Owner != null);
```

`isReadOnly()` on an inverse collection marks the nav read-only for forms only — the owning
side (the child's `hasOne`) controls the FK column's writability. `hasDisplayField` sets which
property the picker displays; the `hasOptions*` family shapes what it offers and adds a
missing target, FK-owning side only ([selection.md](selection.md)).

### Loading: `include` and `expand`

Navigations are never loaded automatically. **Lookup navs** load with `.include(e => e.Nav)`
on the query. **Person navs** take either: `.expand(e => e.Nav)` resolves inline on the same
request (`Id`, `Title`, `LoginName`, `Email` only); `.include(e => e.Nav)` costs one request
more but reads the target's own source, `PrincipalType` included. See [querying.md](querying.md)
for nested `thenInclude` and current limits.

### Explicit loading: `ctx.entry(entity)`

To load one navigation outside a query — e.g. on demand as a form opens —
`ctx.entry(entity)` returns the change-tracker entry, and `entry.reference(nav)`
/ `entry.collection(nav)` return a handle scoped to just that navigation:

```ts
const entry = ctx.entry(project);
await entry.reference((p) => p.Program).loadAsync();
await entry.collection((p) => p.Tags).loadAsync();
```

Both take a selector or a navigation-name string and route by the nav's own cardinality, not
by where its FK lives — a `hasOne`/`@ManyToOne`/`@OneToOne` nav is always a reference; calling
the wrong one throws. Each handle exposes `isLoaded`, `currentValue` (a live read) and
`loadAsync({ force? })`; a nav with zero related rows loads once and stays loaded, and
`entry.reload()` clears loaded state for every nav. `ctx.entry()` also works before an entity is
tracked (a `Detached` entry), so add-mode and edit-mode forms share one loading code path.

### Fixup at save

`saveChangesAsync` runs two relationship fixup passes ([saving.md](saving.md) has the full
pipeline). **Pass 1 (nav wins):** a changed nav property rewrites its FK from the nav's `.Id`
(`null` clears the FK); a direct FK-only change is left alone. **Pass 2:** after new entities
are flushed and get server `Id`s, children added to or removed from an inverse collection have
their FK re-pointed at the parent (or `null`) and are flushed again — one call saves both.

### Person and principal navigations

A person column is a lookup whose target is registered against a **provider source** rather
than a list (SharePoint stores it as a User column; `@speel/migrations` provisions it as one).
Core ships the three targets — `Principal` accepts users and groups alike, `SiteUser` restricts
the field to people, `SiteGroup` to groups — and `@speel/identity` re-exports them:

```ts
import { Principal, SiteUser } from "@speel/core";

@ManyToOne(() => Principal, { foreignKey: 'OwnerId' }) public Owner: Principal | null = null;           // person-or-group
@ManyToMany(() => Principal, { foreignKey: 'ReviewersId' }) public Reviewers: Principal[] | null = null; // multi-value person
@ManyToOne(() => SiteUser, { foreignKey: 'AssignedToId' }) public AssignedTo: SiteUser | null = null;    // user-only
```

`SpeelEntity` declares `Author`/`Editor` (and `SpeelDocument` `CheckedOutBy`) this way, targeting
`SiteUser` with read-only FKs — inherited by every subclass, and re-pointable by re-declaration.

### Provisioning note

`@speel/migrations` provisions relationship fields under the **navigation name**: a nav `Owner`
with FK `OwnerId` creates one SharePoint column named `Owner` — no separate `OwnerId` column
exists; the `Id` suffix is a scalar projection only ([migrations](../../speel-migrations/README.md)).

## Boundaries & gotchas

- **An unregistered target throws.** A navigation may target any entity registered with
  `@Entity` (pulled in by reference) or in the same `ModelBuilder`; anything else fails
  `build()` with `NavigationConfigurationException`.

- **FK property must not be a declared scalar.** `b.property(e => e.ProgramId).isNumber()`
  plus `ProgramId` as a relationship FK is a collision the builder detects and throws on.

- **Inverse collection requires a `withOne` selector or `hasForeignKey`.** A bare
  `.withOne()` with neither throws at build time, asking for one of the two.

- **Column-level refinements are invalid on the inverse side.** `hasColumnName`,
  `hasDefaultValue`, `isIndexed` and `hasCodec({ toProvider, fromProvider })` belong on the
  FK-owning nav; on a
  `withOne` inverse nav they throw `NavigationConfigurationException`.

- **`PrincipalType` is not available via `expand`.** SharePoint rejects the field path in an
  inline `$expand`, so the provider drops it; load the nav with `.include` when you need it.

- **Reference nav target must have a server `Id` at save time.** Pass 1 fixup resolves
  navs via `.Id`, so assigning an unsaved object (`project.Program = new Program()`) silently
  writes `ProgramId = null`. Only inverse collections are re-parented in Pass 2 after flush.
  For self-FK navs, save the target first — in a [scope](scopes.md) if the context holds
  other pending work — and then assign it.

- **Explicit `expand` fields must include the target's key.** Only the default adds it;
  without its id a lookup value is listed twice by the picker and gives the save no FK.

- **No lazy loading.** Navs are `null`/`undefined` until loaded explicitly; reading never fetches.

- **Loading a nav overwrites a pending in-memory assignment.** `loadAsync()`, `include()`, and
  `expand()` assign the server's value and record it as that nav's change-tracking baseline, so an
  unsaved pick made beforehand is discarded and not even dirty afterwards. Guard the load when a
  user may have chosen already.

- **`@speel/react` picker wires to the nav, not the FK scalar.** Point a lookup or person
  field at the navigation property (`Owner`, not `OwnerId`); fixup propagates to the FK at save.
