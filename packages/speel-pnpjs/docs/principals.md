# Principals

## What & when

SharePoint keeps users and groups behind three endpoints that disagree on what to
call the same thing, and its two item-add APIs disagree on how a person column is
written. `SharePointProvider` absorbs both: it serves the three endpoints as
`@speel/core` **provider sources** — `{ kind: "provider", key }` in place of a list
handle on any read — in the model's column spelling, and it resolves a person
column's ids to whatever the write API it picks needs. Those sources are what
`@speel/core`'s `Principal`/`SiteUser`/`SiteGroup` (and `@speel/identity`'s sets over
them) and a person navigation's `.include()` read through — `SpeelEntity.Author`'s
`.include()` reads `siteUsers`. Reach for this page when you read principals or write person
columns through `IStorageProvider` directly (a test harness, an admin tool), or when a
person-column query or save behaves unexpectedly.

## Canonical example

A direct provider consumer: find a user on the `siteUsers` source, then insert a
list item at the root whose `Owner` person column names them. `Project` is the
consumer's entity, with `b.hasOne(Principal, (e) => e.Owner).hasForeignKey((e) => e.OwnerId)`
in its model (`Principal` from `@speel/core`).

```ts
import { getSPFI, SharePointProvider } from "@speel/pnpjs";
import type { IProviderSource, IWriteField } from "@speel/core";
import { Project } from "./entities/Project";

// Any useSharePoint-backed DbContext lends its SPFI; or hand the constructor
// your own `spfi().using(SPFx(context))`. This is a second provider instance
// with its own login cache, separate from the one ctx's DbSets use.
const provider = new SharePointProvider(getSPFI(ctx));

const siteUsers: IProviderSource = { kind: "provider", key: "siteUsers" };

// Read: model spelling in, model spelling out — the endpoint's names never show.
const { items } = await provider.getItemsPagedAsync(
  siteUsers,
  ["Id", "Title", "LoginName", "Email", "PrincipalType"],
  1,
  undefined,
  {
    filter: {
      kind: "compare",
      column: "Email",
      op: "eq",
      value: "ada@contoso.com",
    },
  },
);
const ada = items[0]; // { Id, Title, LoginName, Email, PrincipalType: 1 }
if (!ada) throw new Error("no such site user");

// Write: each field carries the model's own Property and a typed value. A lookup
// whose target lives on a provider source (not a list) is a person column.
const project = ctx.model.findEntityType(Project)!;
const fields: IWriteField[] = [
  { property: project.findProperty("Title")!, value: "Q3 review" },
  { property: project.findProperty("OwnerId")!, value: ada.Id },
];
const [result] = await provider.executeBatchAsync([
  {
    kind: "insert",
    list: { kind: "title", value: "Projects" },
    fields,
    folderServerRelativeUrl: null, // null → the list root
    clientToken: "p1",
  },
]);
if (!result) throw new Error("no result for the insert");
if (result.kind === "failure") throw new Error(String(result.body));
```

The read selected `LoginName`, so _this_ provider instance already holds Ada's
login when the insert runs and resolves nothing further; had it not (or had the
read gone through a different instance), the insert would cost one batched User
Information List read first. Pass a folder's server-relative URL instead of `null`
and the same `fields` go out as form values with a claims Key — the caller never
learns which API was used. An `update` op takes the same `fields` (with `null` to
clear). The contract these calls honour, and the conformance suite that pins it,
are on core's [providers page](../../speel-core/docs/providers.md); batching, typed
reads, folder placement and uploads are on [provider.md](provider.md). Through
the entity API the same reads happen for you: `ctx.siteUsers.where(…)` is a
paged read on `siteUsers`, and `.include()` on a person navigation is an
`itemsByIds` read on the target's source.

## Capabilities

### The three keys

| Key          | Endpoint              | Holds                                                | Carries                                                                                  |
| ------------ | --------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `principals` | User Information List | every user and group the site has seen, one id space | `Id`, `Title`, `LoginName`, `Email`, `PrincipalType` (derived)                           |
| `siteUsers`  | `web/siteusers`       | users plus claims security groups                    | `Id`, `Title`, `LoginName`, `Email`, `PrincipalType` (1 or 4, untouched)                 |
| `siteGroups` | `web/sitegroups`      | SharePoint groups only                               | `Id`, `Title`, `LoginName`, `Description`, `OwnerTitle`, `PrincipalType` (synthesised 8) |

An unknown key throws, naming the three served. The same principal reads
identically from every key that carries it — the conformance suite pins that.
The Carries column lists what is translated or refused; any other endpoint column
(`IsSiteAdmin`, `UserPrincipalName`, …) passes through untranslated — the endpoint
decides whether it exists, which is what lets a `SiteUser` subclass declare one.

### Column translation

Records, filters and order keys all speak the model's names; the provider maps
them per key — on the User Information List `LoginName` is the `Name` column and
`Email` is `EMail` — and maps the rows back. A column a key cannot carry
(`Email` on `siteGroups`, `Description` on the other two) is **dropped from
`$select`**, **refused in `$filter`** with `QueryTranslationException`, and
**refused in `$orderby`** with a plain throw: a predicate is never silently lost.
Provider sources have no folders and no navigations, so a container scope is
refused the same way a filter is, and `expand` is a plain throw. Any `properties`
a read passes type the renamed record, as on a list read; principal columns are
ids and strings already, so a read that passes none gets the same values.

### `PrincipalType`: derived, passed through, synthesised

The User Information List has no `PrincipalType` column, so on `principals` the
provider selects `ContentTypeId` and derives it: the Person content type
(`0x010A…`) is a user (`1`); the two group content types — SharePointGroup
`0x010B…` and DomainGroup `0x010C…` — are a group (`8`). A filter on it becomes
content-type prefix tests: `eq 1` is `startswith(ContentTypeId, '0x010A')`, `eq 8`
is the two group prefixes OR-ed, and `ne` / `not in` are spelled as the
_complementary_ prefixes. Never `not (startswith …)`: SharePoint's list OData has
no negated `startswith` (CAML has no "not BeginsWith") and answers one with a 400
— verified live, 2026-09-14. Only `eq`, `ne` and `in` apply, and only the values 1
and 8: the UIL tells person from group and nothing finer, so `eq 4` is refused
rather than answered with "every group". It cannot be ordered by.

On `siteUsers` the endpoint's own `PrincipalType` passes through untouched — this
is the one key where a claims security group reads as `4`. On `siteGroups` every
record is a SharePoint group, so `PrincipalType` is synthesised as `8` inbound; the
endpoint holds no such column, so it can be neither filtered nor ordered.

### Inline person `$expand`

`.expand()` on a person navigation stays one request: the clause arrives carrying
the target's source, and the provider selects what SharePoint projects through an
inline person expand — `Id`, `Title`, `Name`, `EMail` on the wire — and renames the
sub-record back to model spelling (`LoginName`, `Email`). Anything else the target
declares (`PrincipalType`, a group's `Description`) is dropped rather than asked
for, because a `$select` of `Owner/PrincipalType` fails the whole query. The inline
expand always answers from the User Information List, whatever key the target names;
`.include()` reads the target's own key and carries what that key can answer.

### Paging and counting

`principals` is a list and pages like one: the items iterator, a continuation
cursor per page, `skip` honoured on the first page. `web/siteusers` and
`web/sitegroups` carry no continuation link, so they page by `$skip` offset — the
cursor is the next offset, and a full page may be followed by an empty one; the
conformance suite's small-page drain of `siteGroups` pins that path. `countAsync`
on a provider source is the drained length, filter included.

### The login cache

A person column written through the form-values API takes claims Keys, and a
claims Key is the principal's User Information List login. Every provider-source
read of this instance that **selected `LoginName` and got one** — a query on a
principal set, a person `.include()` — leaves the provider holding `id → login`;
a login does not change under a site, so nothing is ever evicted. A write that follows such a read resolves nothing extra. Ids no read
has returned are looked up **once**, in one batched UIL read, before the batch
opens — and then remembered.

### Person columns on write

A field whose `Property` is a lookup targeting a provider-source entity (its source
is not a list) is a person column; its typed value is the id, or the ids for a
multi-value column. The provider owns the encoding on every write API:

- **List root insert** → `items.add` JSON, the id in the `<Field>Id` column
  (`property.columnName`), an array for a multi-value column.
- **Update** → `items.update` JSON, encoded exactly as the root insert; `null`
  clears the column and an empty array clears a multi-value one.
- **Folder insert** → `addValidateUpdateItemUsingPath` form values, addressed by
  the bare field name, the column a JSON array of claims Keys — `[{"Key": login}]`,
  one per id. That API stores nothing else, and reports no error for what it rejects.
- **`uploadFileAsync`** with typed `fields` encodes exactly as the folder path,
  resolving before any byte moves.

Every path resolves every id first, because SharePoint validates on none of them:
the form-values API answers 200 to an empty Key and stores nothing, and `items.add`
answers 201 to an id the site has never issued and stores a **dangling reference**
(verified live — the FK kept, the expanded `Title` null); `items.update` is the same
JSON path and is checked the same way. An id that cannot be resolved fails **its own
operation** with a status-400 failure whose body names the id and the field; the
rest of the batch is sent. A `null` value names no principal and is never resolved.

### Ensuring a user is the identity provider's

Nothing creates a principal through a provider source. `SharePointIdentityProvider`
implements `IIdentityProvider.ensureUserAsync(loginName)` over `web.ensureUser`,
returning the site-user row in model spelling; `identity.users.ensure` is its
surface. `useSharePointIdentity(context)` wires it up — see `@speel/identity`'s
[identity page](../../speel-identity/docs/identity.md).

## Boundaries & gotchas

- **A `not` over `PrincipalType` on `principals` folds, or is refused.** Directly
  over the compare/`in` leaf it folds in (`eq`↔`ne`, `in`↔`not in`) and emits the
  positive prefix form. Any deeper — a `not` over an `and`/`or` that mentions
  `PrincipalType` — throws `QueryTranslationException` rather than emit the
  `not (startswith …)` the UIL 400s. Rewrite with `ne`, `not in`, or the
  complementary value.

- **`principals` never reports `PrincipalType` 4.** A claims security group is a
  DomainGroup to the UIL and reads back as `8` there — the same record reads `4`
  on `siteUsers`. Query `siteUsers` when the distinction matters; the conformance
  suite pins both facts.

- **`PrincipalType` on `siteGroups` cannot be filtered or ordered.** A `where` on
  it there throws rather than being a tautology.

- **A read that did not select `LoginName` does not warm the login cache.** A
  count, or a read of `Id`/`Title` alone, leaves the next person-column write
  paying one UIL round trip for those ids.

- **A person id must be this site's.** Ids come from this site collection's User
  Information List; a principal the site has never seen must be ensured first
  (`identity.users.ensure`), or the write refuses it — insert and update alike, a
  per-operation 400 in a batch, and from `uploadFileAsync` a thrown
  `UnresolvedPrincipalException` (exported from `@speel/pnpjs`) before any byte
  moves. Nothing creates a principal through a provider source — they are read-only
  by contract; `insert` addresses a list handle only, and a person column whose
  target names a key this provider does not serve is refused the same way, naming
  the key.

- **`null` is a clear, and only an update carries one.** An insert omits unset
  fields by contract; a `null` single-value person on a hand-built insert slips
  through differently per path (the root path sends it, the folder path refuses
  "principal 0"), so do not send one.

- **`countAsync` on `siteUsers`/`siteGroups` caps at 5000.** Those collections are
  counted with one `$top=5000` request; `principals` iterates every page.
