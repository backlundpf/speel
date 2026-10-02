# Identity

## What & when

Reach for `@speel/identity` when your app needs to know **who is using it** and **what they
belong to**: showing the signed-in user, branching on group membership, resolving a person
from a directory search, or changing who is in a SharePoint group. The principal _types_ —
`Principal`, `SiteUser`, `SiteGroup` — are `@speel/core`'s canonical shapes (re-exported here,
so either import works); this package owns everything that _does_ things with them.

SharePoint already owns all of this. What it does not offer is a way to ask from application
code without writing REST by hand — which is why apps end up with a `$select` of
`EffectiveBasePermissions` and a bit-testing helper copied between projects. This package is
the front door to what the platform already knows.

It is a **sibling** of your `DbContext`, constructed separately and held alongside it — and
that context extends `IdentityDbContext`, which is where the principal sets it reads are
declared. Identity depends on things core does not have (an SPFx context, a people-picker
endpoint), and the migrations CLI constructs contexts directly with a stub provider — anything
hung off the context builder would simply be absent there.

For "may they do this" and for changing who can, see [permissions](permissions.md) — the same
identity object, the same staged save.

## Canonical example

```ts
import { initSpeelIdentity } from "@speel/identity";
import { useSharePointIdentity } from "@speel/pnpjs";

// `db` extends IdentityDbContext — the principal sets live there.
const identity = initSpeelIdentity(db, (b) =>
  b.useProvider(useSharePointIdentity(this.context)),
);

// Who is this?
const me = await identity.users.me();
console.log(me.Title, me.Email);

// What do they belong to?
if (await identity.groups.isMember("Internal Auditors")) {
  showAuditorTools();
}

// Change it — staged, then applied together.
identity.groups.addMember(
  "Internal Auditors",
  "i:0#.f|membership|new@contoso.com",
);
identity.groups.removeMember("Reviewers", me);
await identity.saveChangesAsync();
```

## Capabilities

**The current user.** `users.me()` returns a `SiteUser` and caches it for the life of the
`SpeelIdentity` — a page lives minutes and the answer does not change within one. A _failed_
lookup is evicted rather than cached, so one transient error does not poison every later call.
`users.clearCache()` forces the next call to ask again.

**The principal types.** `Principal` (`Id`, `Title`, `LoginName`, `Email`, `PrincipalType`),
`SiteUser extends Principal` and `SiteGroup extends Principal` (adds `Description`,
`OwnerTitle`) are `@speel/core`'s decorated entities against the provider's `principals`,
`siteUsers` and `siteGroups` sources; a person navigation targets one (`@ManyToOne(() =>
SiteUser)`) and it joins any model by reference, and `SpeelEntity`'s `Author`/`Editor` target
`SiteUser` on every context, identity or not. What `IdentityDbContext` adds is the **sets** —
`ctx.principals`, `ctx.siteUsers`, `ctx.siteGroups` — beside `userSettings`, so the directory is
queryable like any entity (`ctx.siteGroups.where((g) => g.Title.startsWith("Audit"))`). They are
read-only through the entity API; `users.ensure` and `groups.create` are the writes. An app that
wants its own principal type subclasses a shape on the same source (`Employee extends SiteUser`)
— see core's [permissions page](../../speel-core/docs/permissions.md).

**Users.** `getById`, `getByLoginName`, `getByEmail`, and `all()` read the `siteUsers` set.
`ensure(loginName)` goes through the identity provider (`ensureUserAsync`) to resolve a login
to a site user, provisioning the site-user record if the person has never visited — which is
what you need before granting them anything.

**Directory search.** `users.search(query)` is wider than the site's user list: it reaches the
people picker, so someone who has never visited the site is still findable. Results come back
as `Principal`, the same type a Person/Group field materializes into, so a search hit can be
assigned straight to a field value. This is the natural implementation for `@speel/react`'s
`peopleSearch` prop, replacing the per-app resolver.

The people picker alone misses reordered or partial names. Give `useSharePointIdentity` a
`graph` source and search also asks Microsoft Graph (Entra ID users): every typed word must
start a word of the person's name, in any order — "John Smith", "Smith, John", "Smi Jo" — and
a single word may also start their login or email ("smithj@…"). Picker hits keep their ranking
first; Graph hits it missed follow, de-duplicated by login, `maxResults` capping the merge.
`graph` is any function that performs a Graph GET and returns the JSON body, so SPFx's
`MSGraphClientV3` adapts in one line:

```ts
const client = await this.context.msGraphClientFactory.getClient("3");
useSharePointIdentity({
  spfxContext: this.context,
  graph: ({ path, query, headers }) =>
    client.api(path).headers(headers).query(query).get(),
});
```

It needs delegated **`User.ReadBasic.All`**: request it in `config/package-solution.json`
(`"webApiPermissionRequests": [{ "resource": "Microsoft Graph", "scope": "User.ReadBasic.All" }]`)
and have a tenant admin approve it under API access in the SharePoint admin center. Until
then the Graph call fails and search quietly falls back to the picker.

**Groups.** `groups.getByName(title)` and `all()` read the `siteGroups` set — the one place a
group's `Description` and `OwnerTitle` come from.

**Group membership, both directions.** `groups.members(group)` lists who is in a group;
`groups.groupsFor(user?)` lists what a user belongs to. `groups.isMember(group, user?)` asks
the question directly, and asks it via the _user's_ groups rather than the group's members —
a person belongs to a handful of groups, while a group can hold thousands of people.

`groups.allWithMembers()` answers "every group and everyone in it" in a single round trip, which
is the shape an administration screen wants — `all()` followed by `members()` per group asks the
same question in N+1.

`groups.create(title)` makes a group and returns it. It is the one mutation here that does not
stage — `saveChangesAsync` reports a tally rather than entities, and the reason to create a
group is to reference the thing you just made. A duplicate title is an error, not an idempotent
no-op; `get()` first if you want to handle that yourself.

`groups.associated()` returns the web's own Owners, Members, and Visitors groups in one read.
Each is nullable — a web can genuinely lack one, and whether that matters is the caller's policy
rather than this package's business.

**Membership changes.** `groups.addMember(group, user?)` and `groups.removeMember(group, user?)`
stage a change; `saveChangesAsync()` applies it. Adding takes a login name and removing takes
an id — SharePoint's own asymmetry, absorbed here rather than pushed onto you.

**Role definitions.** `roles.getByName('Contribute')`, `getById`, `getByType`, and
`allByName()` resolve the web's role catalogue, which is what a permission grant needs an id
from. These are web-scoped and effectively static, so core caches them; `roles.clearCache()`
drops that cache.

**Permissive references.** Anywhere a user or group is named you may pass an entity, an id, or
a name — and omitting a user means the current one:

```ts
await identity.groups.isMember("Auditors"); // me
await identity.groups.isMember("Auditors", 42); // by id
await identity.groups.isMember("Auditors", "i:0#.f|membership|ada@x.com");
await identity.groups.isMember("Auditors", someUser); // SiteUser or Principal
```

**Provider records into principal types.** `toSiteUser`, `toSiteGroup`, and `toPrincipal` type
a record that reached this package through its provider seam rather than through a `DbSet` —
group membership, role assignments, the current user, an ensured user. Records arrive in model
spelling (`ID` is accepted for `Id`, since list-item reads spell it so) and values are copied as
the provider typed them; `toSiteGroup` also supplies the `PrincipalType` that `web/siteGroups`
never returns, so a group from here agrees with the same group read through `ctx.siteGroups`.

**Testing.** `@speel/identity/testing` ships `FakeIdentityProvider`: seed users, groups, and
membership, then assert against its `calls` log — which is how a test proves staged work
reached the wire, and, before a save, that it did not.

## Boundaries & gotchas

**Nothing reaches the wire until `saveChangesAsync()`.** `addMember` looks like it did
something and hasn't. `identity.hasChanges` tells you whether anything is staged, and
`identity.pendingChanges` shows what.

**References resolve at save, not at staging.** That is deliberate — it keeps staging
synchronous and lets you reference something created earlier in the same batch — but it means a
typo in a group title surfaces at the save, not at the call that made it.

**The save is not atomic, and it clears the queue either way.** SharePoint has no transaction
spanning securables, so a failure part-way leaves earlier operations applied.
`saveChangesAsync` applies the staged work in batches — membership changes keep their relative
order — and throws `IdentitySaveException` carrying `applied` and `failures`. The queue is
emptied regardless, so a blind retry cannot re-run what already landed; to retry the failures,
re-stage them from `IdentitySaveException.failures`. The one exception is a cooperative abort
(`saveChangesAsync({ signal })`), which re-stages whatever had not landed and throws
`SaveAbortedException` — a cancellation, not an outcome.

**Membership changes need permissions you may not hold.** They fail at save with an error per
operation, which is inherent to a deferred unit of work — there is nothing to check at staging
time because nothing has been sent.

**The principal types are not mutually exclusive to the compiler.** `SiteUser` and `SiteGroup`
extend `Principal`, and every member of all three is optional, so each still satisfies the
others structurally: a `SiteGroup` passes as a `UserRef`. They are distinct classes at runtime —
an `instanceof` check tells them apart — but nothing stops the wrong one being handed over in
the first place.

**An absent id is not an error.** A record carrying no id materializes into a principal with
`Id` undefined, deliberately: the people picker answers with someone who has never visited the
site, and such a hit has no site-user id until `users.ensure(loginName)` provisions one. That is
why `users.search()` results can be id-less, and why an id is worth checking before you use one
as a key.

**`siteUsers` is `web/siteusers` as served, not "people".** `ctx.siteUsers` / `users.all()`
returns people (`PrincipalType` 1) **and** claims security groups such as "Everyone except
external users" (`PrincipalType` 4), every row typed `SiteUser`; it never contains SharePoint
groups (8). Filter when you mean people — `.where((u) => u.PrincipalType.eq(1))`. (Core's old
`SiteUserSet` used to drop the 4s; the plain set does not.)

**Two seams, one domain.** The principal sets read through the `DbContext`'s storage provider —
`IStorageProvider`'s provider sources, the same reads a person navigation's `.include()`
issues. `me`, `ensure`, directory search, membership, roles and permissions go through
`IIdentityProvider`, which arrives with `initSpeelIdentity`, not the context. That is why
`ensure` is `identity.users.ensure` and not a method on the set.

**Item-level permissions live here, whole.** Core has no permission surface: the entity
members (`RoleAssignments`, `HasUniqueRoleAssignments`) arrive via this package's module
augmentation, the snapshot loads through `IdentityDbContext`'s registered expand, and every
write stages on `identity.permissions`. See [permissions](permissions.md).
