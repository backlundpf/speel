# @speel/identity

**Who the signed-in user is, and what they belong to** — an identity-flavoured wrapper over
SharePoint's own security model, on top of [`@speel/core`](../speel-core). SharePoint already
holds the authoritative directory, the groups, and the permissions; this package makes them
reachable from application code instead of leaving every app to hand-roll a REST call and a
bit mask.

| Package                          | Role                                                                                                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@speel/identity`                | The principal sets over core's `Principal`/`SiteUser`/`SiteGroup` (re-exported here), the services (`users`, `groups`, `roles`, `permissions`, `authorization`), the `IIdentityProvider` contract, and the staged unit of work. No PnPjs, no React, no Node deps. |
| [`@speel/pnpjs`](../speel-pnpjs) | The PnPjs-backed provider + `useSharePointIdentity(...)`, and every bit of mask arithmetic.                                                                                                                                                                       |

**Scope:** the principal sets and services, the current user, user and group lookup,
directory search, group membership in both directions, membership changes, the role-definition
catalogue, per-resource permission changes, effective-permission questions, named authorization
policies, and per-user settings.

## Install

```bash
npm install @speel/identity@beta
npm install @speel/pnpjs@beta      # the SharePoint identity provider (required at runtime)
```

## Quickstart

Extend `IdentityDbContext` so the principal sets and identity's own list are part of your
model — `ctx.principals`, `ctx.siteUsers`, `ctx.siteGroups` and `ctx.userSettings` come with it
(`Principal` itself is `@speel/core`'s and targets a person column on any context):

```ts
import { IdentityDbContext, Principal } from "@speel/identity";

export class AppContext extends IdentityDbContext {
  public things = this.set(Thing); // Thing.Owner: Principal | null, via hasOne(Principal, …)
}
```

Identity itself is a **sibling** of the context, not part of it — it has its own dependencies
and its own lifetime, so it is constructed separately and held alongside `db`:

```ts
import { initSpeelIdentity } from "@speel/identity";
import { useSharePointIdentity } from "@speel/pnpjs";

const identity = initSpeelIdentity(db, (b) =>
  b
    .useProvider(useSharePointIdentity(this.context))
    .addPolicy("PublishViews", (p) =>
      p.requirePermission("addListItems").onList("Speel Shared Views"),
    ),
);

const me = await identity.users.me(); // SiteUser, resolved once
if (await identity.groups.isMember("Auditors")) {
  /* … */
}
if (await identity.authorization.authorize("PublishViews")) {
  /* … */
}

identity.groups.addMember("Auditors", me); // staged
identity.permissions
  .for(list("Contracts"))
  .breakInheritance()
  .grant(me, "Contribute");
await identity.saveChangesAsync(); // applied, in a safe order

await identity.settings.set("theme.dark", true); // per-user, applied immediately
```

## Conventions

**References are permissive.** A group is a title, an id, or a `SiteGroup`; a user is a login
name, an id, a `SiteUser`, or a `Principal` straight out of a Person field. Every `user`
parameter is optional and defaults to the current user, because "am I in this group" is the
question that actually gets asked.

**Nothing reaches the wire until you save.** Reads are immediate; every mutation stages and is
applied by `saveChangesAsync()`. References resolve at save time, so a group created earlier in
the same batch still resolves. The save groups permission work by resource and orders it —
inheritance breaks ahead of the grants that depend on them.

**The current user is cached, failures are not.** `me()` costs one round trip per
`SpeelIdentity`; a rejected lookup is evicted so a transient error does not poison the page.

## Topic pages

- [Identity](docs/identity.md) — read when you need the principal sets, the current user,
  group membership, or role definitions, or when a staged change did not land the way you
  expected.
- [Permissions](docs/permissions.md) — read when asking whether a user may do something,
  when changing who can reach a web, a list, or an item, or when loading a row's role
  assignments onto the entity.
- [Settings](docs/settings.md) — read when storing a user's own preferences, or when wiring
  `IdentityDbContext` into an existing app.
