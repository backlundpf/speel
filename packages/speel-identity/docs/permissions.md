# Permissions

## What & when

Reach for this when the question is **"may they do this?"** or the intent is **"change who can."**

Every app that has ever needed the first has written the same thing: a `$select` of
`EffectiveBasePermissions`, a helper that splits a 64-bit mask into two 32-bit halves, and an
off-by-one waiting to happen on the 1-based bit positions. That helper should not exist in your
app. `authorization.hasPermission('addListItems', list('Contracts'))` is the whole of it, and
the arithmetic happens inside `@speel/pnpjs` using PnP's own tested helper.

The second — changing permissions — is where the staging matters. Setting up a resource is
rarely one call: you break inheritance, then grant the people and groups who should keep
access. Those have to arrive in that order, and a half-applied version of them is a resource
nobody can reach.

## Canonical example

```ts
import { initSpeelIdentity, list, item } from "@speel/identity";
import { useSharePointIdentity } from "@speel/pnpjs";

const identity = initSpeelIdentity(db, (b) =>
  b
    .useProvider(useSharePointIdentity(this.context))
    .addPolicy("PublishViews", (p) =>
      p.requirePermission("addListItems").onList("Speel Shared Views"),
    ),
);

// Asking — the common case, and the only identity call most pages make.
if (await identity.authorization.authorize("PublishViews")) {
  showPublishButton();
}

// Changing — one intention, staged, applied together. `.for()` takes the
// entity itself (sugar for `item(contract)`), a descriptor, or `web()`/`list()`.
identity.permissions
  .for(contract)
  .breakInheritance()
  .grant("Internal Auditors", "Contribute")
  .grant(owner, "Full Control");

await identity.saveChangesAsync();
```

## Capabilities

**Resources.** `web()`, `list(title)`, `itemIn(list, id)`, and `item(entity)` name what a
permission applies to. They are descriptors, not handles — `item(entity)` records the entity
and resolves its list and id from the model when it is used, so it can name something the same
batch is about to touch.

**Asking.** `authorization.hasPermission(kind, resource?, user?)` defaults to the web and the
current user. `effectivePermissions(resource?, user?)` returns the whole mask for surfaces that
display capability rather than branch on one bit.

**The vocabulary is SharePoint's**, camelCased: `viewListItems`, `addListItems`,
`editListItems`, `manageLists`, `managePermissions`, and thirty more. The names mirror the
platform exactly so they can be searched against Microsoft's documentation, and they are a
union type, so a typo is a compile error rather than a silent `false`.

**One round trip per resource.** The whole mask is fetched once per resource-and-user and
cached, so a page asking four questions about one list pays for one call. `saveChangesAsync`
clears the cache; `authorization.clearCache()` does it by hand.

**Saving is batched.** `saveChangesAsync` resolves every distinct reference once — three
hundred grants of the same role look the name up one time — and applies the staged work in
`$batch` round trips of up to 100 operations, so a bulk permissions pass costs a handful of
requests rather than hundreds. `saveChangesAsync({ maxBatchSize, signal })` tunes the chunking
or aborts cooperatively; an abort re-stages everything that did not land, so a cancellation
loses nothing.

**Policies** name a question where the app is configured, so it is asked by name everywhere
else rather than re-derived slightly differently in three components:

```ts
b.addPolicy("PublishViews", (p) =>
  p.requirePermission("addListItems").onList(SHARED_VIEWS_LIST),
)
  .addPolicy("Auditor", (p) => p.requireGroup("Internal Auditors"))
  .addPolicy("OwnerOrAdmin", (p) =>
    p.require(
      async (ctx) =>
        (await ctx.hasPermission("manageWeb")) ||
        (await ctx.isMember("Owners")),
    ),
  );
```

All requirements must hold, and the first failure short-circuits the rest. Scope is fixed with
`onWeb()`, `onList(title)`, or `on(resource)`, or left open and supplied at `authorize` time —
where the argument wins over the policy's own. Re-registering a name replaces it, which is how
a host overrides a policy a shared module declared.

**Changing.** `permissions.for(resource)` returns a chainable handle with `breakInheritance`,
`resetInheritance`, `grant`, and `revoke` — all staged — plus `assignments()`, which reads
immediately because listing who holds what is not a change. It returns `RoleAssignment[]` — a
`Principal` member and the role names it holds — so a caller can tell a user from a group by
`PrincipalType` without reaching into raw expanded JSON. Principals and roles take the same
permissive references as everywhere else: an entity, an id, a login name, or a role name.
`for()` also accepts the entity itself, resolving its list and id from the model.

**The securable snapshot on entities.** On a context extending `IdentityDbContext`, an entity
query can carry a row's whole permission state in one round trip:

```ts
const responses = await ctx.responses
  .where((b) => b.ReqNumId.eq(requestId))
  .expand((x) => x.RoleAssignments)
  .toArrayAsync();
// responses[0].RoleAssignments      → SPRoleAssignment[] (wire-accurate:
//                                      Member + RoleDefinitionBindings)
// responses[0].HasUniqueRoleAssignments → boolean, rides the same clause
```

The entity keeps SharePoint's own shape; `asRoleAssignments(raw)` collapses it to the
`{ member, roles }` dialect `assignments()` returns, so both read paths hand consumers one
type. The members exist on `SpeelEntity` through this package's module augmentation
(`ISecurable` names the set); the runtime is registered by `IdentityDbContext`, so a plain
`DbContext` never resolves the expand. `EffectiveBasePermissions` is typed but has no
loader yet — ask through `authorization` instead.

**Reconciling.** When the app states what a securable SHOULD grant, the engine compares and
converges — diff, plan, batched apply:

```ts
const desired = {
  inherits: false,
  assignments: [{ member: office, roles: ["Contribute"] }],
};
const report = diffSecurable(entity, desired); // "matches" | "drift", differences spelled out
if (report.status === "drift") {
  const plan = planOperations(entity, desired); // inheriting: break + grant the full set;
  //                                             unique: revokes → grants (or a lone reset)
  const [result] = await applySecurables(identity, [
    { resource: entity, plan },
  ]);
}
```

`diffSecurable`/`planOperations` are pure: the actual state arrives ON the securable (an
entity carrying the snapshot, or anything structurally `ISecurable` built from a raw read),
and desired state is one options-bag (`DesiredPermissions`) of ordinary `RoleAssignment`s —
roles compared as exact sets, `SYSTEM_ROLES` ("Limited Access", …) filtered everywhere. The
plan is what runs, plus one thing: SharePoint gives the caller Full Control on a `break`, and
apply revokes it after the grants unless the plan grants it. `applySecurables` stages EVERY
plan on one queue and saves once (plus that follow-up) — results align with the input; a
securable with failed operations reports `ok: false` with its partial count and keeps the
caller's Full Control, so a re-run converges it. `applySecurable` is one-entry sugar.

**Testing.** `@speel/identity/testing` ships `seedSecurable(provider, list, id, { unique,
assignments })`, stating a row's snapshot on `FakeStorageProvider` in the simple shape
while storing the wire payload — entity reads in tests exercise the real materializer.

### Provisioning permission levels

`identity.roles` provisions the levels themselves — the rows the catalogue above reads, not
what a resource grants. Four verbs, `create`, `clone`, `update`, `delete` — the case this
shipped for is cloning a built-in with one addition:

```ts
await identity.roles.clone("Contribute", "Contribute + Manage Permissions", {
  add: ["managePermissions"],
});
```

Permissions are named, the same `PermissionKind` union `hasPermission` takes — identity has no
mask vocabulary; the provider composes SharePoint's 64-bit mask on its side of the seam. These
writes are immediate, unlike a grant, which stages until `saveChangesAsync`: a caller
provisioning a level needs its id back, the same reason `groups.create` is immediate.

`update` takes either `permissions` (the whole set) or `add`/`remove` (a delta), never both — a
compile error for TypeScript callers, a thrown exception for JS ones. Every write folds its
result back into the cached catalogue, so the next `getByName` sees it without a refetch.

## Boundaries & gotchas

**Ordering is imposed, not preserved.** Within a resource the save applies inheritance breaks,
then revokes, then grants, then inheritance resets — whatever order you staged them in. This is
the point of the whole mechanism: **a grant on a resource that still inherits does not fail, it
edits the parent's assignments**, quietly widening access somewhere you were not looking.
Resets go last for the same reason in reverse — after a reset the resource inherits again, so
anything following would land on the parent.

Staging a reset _and_ a grant on one resource is incoherent whichever way it runs, since the
reset discards what the grant just made. Reset-last makes that visible instead of silent.

**Groups apply in the order they were first touched**, and membership changes — which name no
resource — keep their own relative order and interleave with resource work. So adding people to
a group before granting that group access still does what it reads like.

**The save is still not atomic.** SharePoint has no transaction spanning securables. A failure
part-way leaves earlier resources applied; `IdentitySaveException` carries `applied` and
`failures`, and the queue is emptied either way. Per-resource grouping is what keeps any single
resource all-or-nothing, which is the case worth protecting.

**A resource that cannot be resolved fails before anything is sent** — an unsaved entity, or a
type not mapped to a list — and is reported as a failed operation rather than abandoning the
rest of the save.

**There is no `hasRole`, deliberately.** SharePoint has no "which role do I hold here" call:
answering it means reading the resource's assignments and then checking whether any principal
is the user _or_ a group they belong to — two round trips, and wrong whenever the role arrived
through an Entra security group, which does not enumerate through `siteGroups`.
`hasPermission` is one round trip and is correct however the access was acquired. For displaying
who holds what, read `assignments()`.

**This queue is the only write path.** Core's old `db.permissionsFor()` change-tracker
staging is gone; every permission mutation goes through `identity.permissions` and
`identity.saveChangesAsync()`. One write path, one ordering rule.

**The securable snapshot is live-read only.** A cache config naming `RoleAssignments`
throws at model build: permission state must be fresh — a diff engine applying against a
stale snapshot would mis-apply — and the cache pipeline cannot delta-sync a computed
clause.

**Reconciling an un-expanded entity throws.** `ISecurable`'s members are optional, so an
entity read without the snapshot would otherwise diff as "inherits, holds nothing" —
`diffSecurable`/`planOperations` refuse it instead. `[]` after the expand is real; only
`undefined` means not-loaded.

**One apply call at a time.** The queue is shared, so two concurrent `applySecurables`
calls would take each other's staged operations. Batch everything into one call — that is
what it is for.

**Asking is a client-side answer to a server-side question.** `hasPermission` reports what
SharePoint would allow, which is what makes it right for showing and hiding UI. It is not a
security boundary: the platform enforces the real one, and a user who forges a `true` here
still gets a 403 from the server.

**`update` and `delete` refuse a built-in level** (`RoleTypeKind !== 0` — "Full Control",
"Read", "Limited Access"). Re-permissioning or deleting one is irreversible site damage; clone
it into a custom level instead. `create` and `clone` are unaffected — cloning a built-in is
the point.

**`order` defaults to 0**, and SharePoint's built-in levels sit well above that, so a level
created without one sorts ahead of them. `clone` does not inherit the source's order either —
it falls back the same way `create` does.

**Deleting a level that assignments reference drops those bindings** — SharePoint's behaviour,
not something this package softens.

**A level is web-scoped**, like the catalogue that caches it.

**A second `SpeelIdentity` instance holds a second catalogue.** A write through this one
leaves the other stale until its own `clearCache()` — as does a write whose read-back fails
locally: `update` MERGEs then re-reads and rejects without folding in on failure, and a lost
`delete` response never reaches `forget`. `roles.clearCache()` recovers either case.
