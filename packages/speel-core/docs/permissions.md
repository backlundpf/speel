# Permissions & principals

## What & when

`@speel/core` is **permission-free**: item-level permission state (role assignments,
inheritance, effective rights) and everything that _does_ things with principals —
`ensure`, membership, roles, the sets on `IdentityDbContext` — live in
[`@speel/identity`](../../speel-identity/README.md). What core owns is the principal
**shapes** — `Principal`, `SiteUser`, `SiteGroup`, decorated entities against the provider's
principal sources — and the mechanism a person column runs on: a navigation whose target is
registered against a _provider source_ rather than a list. `SpeelEntity`'s `Author`/`Editor`
target `SiteUser` out of the box. Use this page when you model a person column, want your
own principal type, or are looking for where item-level permissions went.

## Canonical example

A person column needs nothing beyond core: import a shape, name it as the navigation's
target, and it joins the model by reference. An app that wants its own principal type
subclasses a shape on the same provider source and re-points the inherited navigation once,
on its own base class — every entity below inherits the override.

```ts
import {
  DbContext,
  SpeelEntity,
  SiteUser,
  Principal,
  Entity,
  TextField,
  ManyToOne,
  initSpeelDbContext,
} from "@speel/core";
import "@speel/pnpjs";

// Your own site-user shape: the same `siteUsers` source, plus a column web/siteusers carries.
@Entity({ source: { kind: "provider", key: "siteUsers" } })
class Employee extends SiteUser {
  @TextField() public UserPrincipalName?: string = undefined;
}

// Re-point the inherited Author (typed SiteUser) at Employee; subclasses inherit it.
abstract class AppEntity extends SpeelEntity {
  @ManyToOne(() => Employee, { readOnly: true, foreignKey: "AuthorId" })
  override readonly Author?: Employee = undefined;
}

@Entity({ list: "Projects" })
class Project extends AppEntity {
  @TextField({ required: true }) public Title: string | null = null;

  // A person column: a lookup whose target lives on a provider source. Principal
  // accepts users and groups; SiteUser restricts the picker to people.
  @ManyToOne(() => Principal, { foreignKey: "OwnerId", displayName: "Owner" })
  public Owner: Principal | null = null;
  public OwnerId: number | null = null;
}

class ProjectContext extends DbContext {
  public projects = this.set(Project); // Principal and Employee join by reference
}

// In a WebPart's onInit():
const ctx = initSpeelDbContext(ProjectContext, (b) =>
  b.useSharePoint(this.context),
);

const projects = await ctx.projects
  .include((p) => p.Owner)
  .include((p) => p.Author)
  .toArrayAsync();
projects[0]?.Author?.UserPrincipalName; // read from web/siteusers
```

## Capabilities

### A provider source is the other kind of home an entity can have

`EntitySource` is a list — `{ kind: "list", list, provisioning? }` — or a **provider
source**, `{ kind: "provider", key }`: something the provider serves that is not a list.
`b.toProviderSource(source)` is the general builder form and `b.toList(title, provisioning?)`
its list shorthand; the decorator mirrors them as `@Entity({ source })` and
`@Entity({ list })`. Every read core issues for such an entity — a query on its set,
`findAsync`, an `.include()` on a navigation that targets it — goes to the provider under
that key, in the model's column spelling. `@speel/pnpjs` serves three: `principals` (the
User Information List — every user and group the site has seen), `siteUsers` and
`siteGroups` (see its [principals page](../../speel-pnpjs/docs/principals.md)).

Through the entity API a provider source is **read-only**: `DbSet.add`/`remove` throw
`InvalidOperationException` naming identity's operations (`identity.users.ensure`,
`identity.groups.create`), and it cannot be cached, foldered or provisioned — a migration
skips it. Reads are exactly the query pipeline: `where` (the provider translates or refuses
each column per key), `orderBy`, paging, `countAsync`.

### The canonical shapes: `Principal`, `SiteUser`, `SiteGroup`

Core ships the three as decorated entities — `Principal` (`Id`, `Title`, `LoginName`,
`Email`, `PrincipalType`) on `principals`, `SiteUser extends Principal` on `siteUsers`,
`SiteGroup extends Principal` (adds `Description`, `OwnerTitle`) on `siteGroups` — and
`@speel/identity` re-exports them, so either import path names the same class. `SiteUser`
is what `SpeelEntity`'s `Author`/`Editor` and `SpeelDocument`'s `CheckedOutBy` target: a
row's creator is a site user by definition, the include reads `web/siteusers` by id, and the
row carries SharePoint's own `PrincipalType` (`1` = user, `4` = security group, `8` =
SharePoint group). `Author`/`Editor` are typed `SiteUser` and `@speel/react`'s `peopleSearch`
resolves `Principal[]` — concrete classes, no interface to satisfy.

A navigation's `@Entity`-registered target **joins the model by reference**, transitively:
`set(Project)` brings `Principal` and `SiteUser` along, and nothing needs `set()`-ing for a
person column or for `Author` to resolve. Decorated entities nothing references stay out.

### Your own principal type

Every shape is subclassable, and the provider decides what it serves. `Employee extends
SiteUser` declares `@Entity({ source: { kind: "provider", key: "siteUsers" } })` and its extra
columns; the builder replays the inherited decorators, and `@speel/pnpjs` passes a column
outside its translation table (`UserPrincipalName`, `IsSiteAdmin`) through to the endpoint
verbatim — a column the endpoint lacks fails there, loudly. Two entities on one provider key
are legal (only list sources are uniqueness-checked), so `Employee` builds beside `SiteUser`.

Navigations merge by name, so re-declaring `Author` replaces the inherited navigation
outright and the include reads the new target's source — with a decorator on your own base
class as above, or per entity in `onModelCreating` with
`b.hasOne(Employee, "Author").withMany().hasForeignKey("AuthorId").isReadOnly()` (a replacement
starts clean: restate `readOnly` and the FK). Nothing is read for `Author`/`Editor` unless you
`.include()` them; an entity that does not extend `SpeelEntity` has no such members.

### Person columns are lookups

There is no `User` field kind. A person column is a `Lookup` whose target's source is a
provider source, which is what every layer keys on: `@speel/migrations` provisions it as a
SharePoint User field, `@speel/react` renders it as the people picker (an identity in context
adds group suggestions and provisioning), and the query pipeline loads it with `.expand()`
(inline; `Id`/`Title`/`LoginName`/`Email` only) or `.include()` (one extra request on the
target's own source; `PrincipalType` populated). Details in [loading.md](loading.md) and
[relationships.md](relationships.md).

### Everything about _who_ lives in `@speel/identity`

Extending `IdentityDbContext` (instead of plain `DbContext`) is the opt-in. With it:

- `Principal`, `SiteUser` and `SiteGroup` are declared as sets — `ctx.principals`,
  `ctx.siteUsers`, `ctx.siteGroups` — so you can query the directory like any entity;
- `identity.users` (`me`, `ensure`, `getByLoginName`, `getByEmail`, `search`) and
  `identity.groups` (`getByName`, `members`, `isMember`, …) answer the questions, and
  `ensure` — the one operation that creates a principal — is theirs;
- entities gain typed `RoleAssignments` / `HasUniqueRoleAssignments` /
  `EffectiveBasePermissions` members (identity's module augmentation), and
  `.expand((x) => x.RoleAssignments)` loads the whole securable snapshot in one clause;
- permission **writes** stage on `identity.permissions.for(...)` and flush through
  `identity.saveChangesAsync()`; role definitions resolve through `identity.roles`.

See [identity](../../speel-identity/docs/identity.md) and
[permissions](../../speel-identity/docs/permissions.md). Under the hood identity plugs into
core's generic _special expand_ seam (`ModelBuilder.addSpecialExpand`) — a model-registered
expandable that owns its wire clause and materialization; core knows nothing
permission-specific.

## Boundaries & gotchas

- **A provider source is read-only through the entity API.** Bringing a user into the site
  is `identity.users.ensure(loginName)` (the identity provider's `ensureUserAsync`), never an
  `add()` on a principal set; creating a group is `identity.groups.create`. `add()` and
  `remove()` on such a set throw before any request goes out.

- **`PrincipalType` is not available via person-field `expand`.** An inline person
  `$expand` answers `Id`, `Title`, `LoginName` and `Email` and nothing else, so after
  `.expand(e => e.Owner)` the nav's `PrincipalType` is `undefined`. Paths that do populate
  it: `.include(e => e.Owner)` (one extra request), a query on the target's set, and
  identity's securable snapshot (`RoleAssignments/Member` carries SharePoint's own value).

- **The User Information List cannot tell a security group from a SharePoint group.** A
  nav targeting `Principal` resolves against that list, which has no `PrincipalType`
  column; the provider derives it from the entry's content type, which distinguishes only
  person from group. Any non-user therefore reads as `8`; `4` is not recoverable there.
  `SiteUser` (and so `Author`/`Editor`) reads `web/siteusers`, which reports SharePoint's
  own value and does distinguish them.

- **A subclass column is the endpoint's business.** Core and the provider pass
  `Employee.UserPrincipalName` through; whether `web/siteusers` carries it is decided by
  SharePoint at read time, not at model build. Keep such columns to what the endpoint
  documents, and expect a `$select` it rejects to fail the query.

- **Re-pointing `Author` re-points the include, not the column.** `AuthorId` is still
  SharePoint's `Author` lookup id; the new target only changes which source the id is
  resolved against — which must serve site users by that id (`siteUsers` does; a list
  does not).

- **There is no permission write path on the context.** `identity.permissions` is the one
  writer; a context that never touches `@speel/identity` can neither read nor change item
  permissions — by design.
