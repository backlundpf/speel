# SharePoint Provider

## What & when

`SharePointProvider` is the PnPjs v4-backed implementation of `@speel/core`'s whole
storage contract — `IStorageProvider` (OData translation, typed reads and writes,
$batch, principal sources), `IFileSystem` (folders, uploads, renames, copies,
check-in) and `IChangeFeed` (change-token reads) — everything needed to connect a
`DbContext` to a live SharePoint site. You use it through `@speel/core`'s query and
save surface; reach for this page when diagnosing SharePoint-specific behavior or
dropping to raw PnPjs. Principals and person columns: [principals.md](principals.md).

## Canonical example

```ts
import "@speel/pnpjs";
import { getSPFI } from "@speel/pnpjs";
import {
  DbContext,
  ModelBuilder,
  SpeelEntity,
  initSpeelDbContext,
} from "@speel/core";

class Project extends SpeelEntity {
  public Title: string | null = null;
  public Year: number | null = null;
}

class AppContext extends DbContext {
  public projects = this.set(Project);

  protected override onModelCreating(b: ModelBuilder): void {
    b.entity(Project, (eb) => {
      eb.toList("Projects");
      eb.property((e) => e.Title)
        .isText()
        .isRequired();
      eb.property((e) => e.Year).isNumber();
    });
  }
}

// In onInit():
const ctx = initSpeelDbContext(AppContext, (b) =>
  b.useSharePoint(this.context),
);

// Regular query — OData translation, paging, expand all handled by the provider.
const recent = await ctx.projects
  .where((b) => b.Year.ge(2025))
  .orderBy((b) => b.Title, "asc")
  .toArrayAsync();

// Escape hatch — raw PnPjs for operations the abstraction doesn't cover.
const sp = getSPFI(ctx);
const allFields = await sp.web.lists.getByTitle("Projects").fields();
```

## Capabilities

### OData translation

The core filter builder emits `FilterNode` trees; the provider translates them
to OData strings via `toODataString` (the full operator surface and query-chain
semantics: [../../speel-core/docs/querying.md](../../speel-core/docs/querying.md)):

- **Comparison** — `eq`, `ne`, `gt`, `ge`, `lt`, `le` map to OData operators;
  date values are emitted as `datetime'<ISO>'`; `isNull` / `isNotNull` emit
  `eq null` / `ne null`; `and`/`or`/`not` are parenthesised and joined correctly;
  `in` / `not in` expand to `OR`-chained equality expressions.
- **Booleans** — emitted as `1` / `0`, not `true` / `false`; SharePoint rejects the
  OData keywords on a Yes/No column. `isTrue()` becomes `Flag eq 1`.
- **String operations** — `startsWith` → `startswith(…)`, `endsWith` →
  `endswith(…)`, `contains` → `substringof(…)`.
- **MultiChoice** — `contains` and `containsAny` emit single or `OR`-chained
  equality; `containsAll` throws `QueryTranslationException` (chain `contains` with `and`).
- **Ordering and paging** — `orderBy` keys become `.orderBy(col, ascending)` on
  the PnPjs fluent chain; `take` sets `.top(n)`; `skip` only when greater than zero.

`$select` carries the entity's column names plus one path per expanded field,
built from the `IExpandClause` descriptor — nested paths such as
`RoleAssignments/Member` included; the `expand` vs `include` split is core's.
SharePoint will not project a path-shaped select unless the owning navigation is
also expanded, so **the provider derives `$expand` from any column containing a
`/`** — `$select=File/Length` always ships with `$expand=File`, which is what makes
`SpeelDocument.FileSize` (column `File/Length`; `File_x0020_Size` is computed and
unselectable) work. Plain columns never produce an expand.

### Typed reads

Every item read takes the model's `properties` beside its `$select`, and the provider
returns each described column as the contract's typed value: an ISO string becomes
a `Date`, a Yes/No `0`/`1` a boolean, a lookup id a `number`, a multi-value column an
array (bare, or verbose OData's `{ results: [...] }`), an Int64 string such as
`File/Length`'s a `number` — path-shaped columns are typed in place, nested where
they arrive. Expanded sub-records are typed through the clause's own `properties` (the
target entity's). A column no property describes, or a read that passes none, comes back
exactly as SharePoint sent it. A value a property cannot explain (a non-date in a
`DateTime`, an unrecognised multi-value shape, a non-numeric id) throws `DataException`
naming the column — typed, never guessed. Every record is fresh JSON per read: the
provider retains nothing it hands to core, as the contract requires.

### The `in` query-string budget

SharePoint has no `in` operator, so an `in` node becomes one OR-ed equality per
value: the _number of values_ sets the URL length, and past 2048 characters — the
ASP.NET `maxQueryStringLength` default, which SharePoint Online does not raise — the
request fails with `[400] … exceeds the configured maxQueryStringLength value`. The
provider therefore implements `maxInFilterValues`, an **optional** `IStorageProvider`
member: given the `in` column, the read's fields and the widest value in the set, it
prices the request it _would_ emit — `$select`, the `$expand` any path-shaped column
implies, `$top`, the `(…) and FSObjType eq 0` wrapper — and answers how many values
still fit. Core consults it where it builds an `in` itself: inverse-FK `include()`
chunks parent ids by the budget, so a 500-parent include becomes several short URLs
rather than one 400. The answer is floored at 1 — no id is ever dropped to make a URL
fit — and holds back a few hundred characters of headroom on purpose: PnPjs appends a
`$skiptoken` when it follows the server's nextLink, so **page 2 of a chunk is longer
than page 1**.

### Folder placement on add

The `IFileSystem` members (this and the next three sections) delegate to an internal
`SharePointFileSystem`. `@speel/core` calls `ensureFoldersAsync` before a folder-placed
`add` to resolve or create the target folder, then issues an `insert` carrying the URL.
Folders are created as **list folders** via `addSubFolderUsingPath` off the list's
root folder, segment by segment in sequence — this matters: list folders are backed
by list items and appear in list views; web.folders-created paths do not. Shared
ancestors are deduplicated (`a/b/c` and `a/b` together create `a`, `a/b`, `a/b/c`
once each) and "already exists" errors are swallowed, keeping `ensureFoldersAsync`
idempotent. A foldered insert posts form values to `addValidateUpdateItemUsingPath`
with the folder URL, surfacing per-field `HasException` rows as batch failures.

### File uploads — `uploadFileAsync`

File-content adds bypass the `$batch` (chunked uploads carry live progress and
abort) and run through `uploadFileAsync`, sequentially per file. Content below
~10 MB uploads single-shot via `addUsingPath`; larger content goes through PnPjs
`addChunked`, reporting `{ bytesUploaded, bytesTotal }` per chunk. An `AbortSignal`
is checked before the upload and between chunks; an aborted chunked upload
best-effort deletes the stub file PnPjs pre-creates. The implicitly-created list
item is then fetched and the entity's metadata applied via `validateUpdateListItem`
— a metadata failure after a successful upload reports that the file exists at its
URL (no rollback). Metadata arrives as typed `fields`, encoded exactly as a folder
insert's, person ids resolved **before any byte moves** ([principals.md](principals.md)).

### Renames — `renameFileAsync` / `renameFolderAsync`

SharePoint exposes no rename verb, so both are moves within the current parent,
issued through `SP.MoveCopyUtil` via PnPjs `moveByPath`. `renameFileAsync` reads
the item's `FileRef` first (a document can sit in any folder of the library), then
moves the file with `shouldOverWrite` **false**, so an occupied destination fails;
within one library the item id, version history, and permissions survive the move.
`renameFolderAsync` resolves the list root, then moves the folder — `MoveFolderByPath`
takes no overwrite flag at all, so a collision always fails, and the whole subtree moves.

### Folder delete and check-in

`deleteFolderAsync` resolves the list root, then calls `SP.Folder.Recycle`, so the
folder is recoverable rather than destroyed — matching the recycle default for
items. It takes the whole subtree as one recycle-bin entry and accepts no emptiness
guard: `DeleteIfEmpty` belongs to `deleteWithParams`, a hard delete, which a
recycling contract has no business reaching for. `checkinFileAsync` reads the
item's `FileRef` (as the file rename does), then calls `File.checkin` with
`CheckinType.Minor` — passed explicitly, because PnPjs defaults to `Major`. Checking
in a file that is not checked out fails at the server; the provider adds no pre-check.

### Container-scoped queries

The `container-scope` filter node (core's `inFolder`) renders to `FileDirRef`
equality — plus a trailing-slash `startswith` for recursive scopes — resolving
the list root once per scoped query. Unless `includeContainers` is set, item
reads and counts append `FSObjType eq 0`, excluding SharePoint's interleaved
folder rows. `countAsync` reads `ItemCount` (which counts folder rows) only when
containers are included and nothing is filtered; otherwise it iterates `Id`-only pages.

### Principals and person columns

SharePoint's three principal endpoints are served as `@speel/core` provider sources
(`principals`, `siteUsers`, `siteGroups`) in model spelling, `PrincipalType` derived where
the endpoint has none — the reads behind core's `Principal`/`SiteUser`/`SiteGroup`,
`@speel/identity`'s sets and a person nav's `.include()` (`SpeelEntity.Author`'s `.include()`
reads `web/siteusers`). An inline person `$expand` selects `Id`/`Title`/`Name`/`EMail` and comes
back renamed; person-column ids are validated and resolved on every write API through a
per-instance login cache. All of it: [principals.md](principals.md).

### $batch writes and chunking

All mutations go through `executeBatchAsync`, which batches operations using
PnPjs's `.batched()` API (SharePoint `$batch` endpoint) in a single request —
chunking happens upstream in the save executor (`maxBatchSize`, default 100).
Results come back aligned to the input array by `clientToken`, each a success or a
failure carrying the status and body. Batch semantics are **per-operation
independent** — a partial-success response leaves committed operations committed.
`getItemsByIdsAsync` also uses `$batch` (chunks of 100), 404s mapped to `null`.

**Typed writes.** `insert` and `update` hand over `IWriteField`s — the model's own
`Property` and a typed value — and no wire format; the provider picks the API by
destination and owns every encoding. A root insert (`items.add`) and every update
(`items.update`) take JSON keyed by `property.columnName`: `<Field>Id` for a
lookup, ISO for a `Date`, an array for a multi-value column, JSON `null` for an
update's clear. A foldered insert (`addValidateUpdateItemUsingPath`) takes form
values addressed by the bare field name: `;#`-delimited multi-value lookups and
choices, the sortable `YYYY-MM-DD HH:mm:ss` date that API insists on, claims Keys
for people. Person ids are resolved before the batch opens on every path; an
unresolvable one fails its own operation ([principals.md](principals.md)).

### Change-token reads

`getListItemChangesSinceToken` — the `IChangeFeed` member, behind an internal
`SharePointChangeFeed` — drives the caching layer's incremental sync: it calls
SharePoint's `GetListItemChangesSinceToken` SOAP-over-REST endpoint, parses the XML
with regex (no DOM dependency), then fetches modified items — typed, like any read —
with a `Modified ge '<ISO>'` filter derived from the token's embedded timestamp. An
empty token (first load) omits `ChangeToken` and fetches everything; a token that
hasn't advanced skips the `Modified` query outright; otherwise the delta returns
modified items, parsed deletion ids and the new token. The change-log query members
are always primitive strings — objects cause a 400.

### `getSPFI` escape hatch

`getSPFI(context)` returns the configured `SPFI` instance behind any
`SharePointProvider`-backed context, for PnPjs operations `@speel/core`'s surface doesn't
cover — field definitions, views, site columns; the canonical example ends with one. It
throws if the context is not backed by a `SharePointProvider` (a `FakeStorageProvider`
test context), so guard it or keep it to production code.

## Boundaries & gotchas

- **Deletes recycle by default.** The `delete` batch operation calls `.recycle()` unless it
  carries `permanent: true`, which switches to a bin-bypassing `.delete()`.

- **A hand-written `.in()` is not chunked.** The budget above applies only where
  `@speel/core` builds the `in` itself; `where(b => b.ResID.in(ids))` with a few hundred
  ids hits the same 2048-character wall, and nothing splits it — chunking a user's filter
  would turn one query into N, which `take`/`skip` and `countAsync` cannot reconcile. Keep
  such sets to a few dozen values, or drive the relationship from the other side with an
  inverse-FK `include()`, which is chunked.

- **Folder existence detection is best-effort.** `ensureFoldersAsync` treats errors whose
  message contains "already exists" as success — a string match unconfirmed across locales.

- **Paging iterates via `Symbol.asyncIterator`.** Each `next()` is one HTTP round-trip;
  the iterator is held under a cursor key between calls so paging state survives React
  renders, and dropped on the final page.

- **Every document-library read carries `$expand=File`.** `SpeelDocument` declares `FileSize`
  on every subclass, so the expand is not opt-in — one extra join per row, no extra round-trip,
  a little of the `in` budget above. Rows without a file (folders, or an item whose file is
  gone) project no `File` object; that is not an error, and `FileSize` materializes as `undefined`.
