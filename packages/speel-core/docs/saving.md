# Saving

## What & when

The saving pipeline persists tracked entity changes to SharePoint via a single
`saveChangesAsync()` call. The change tracker automatically watches loaded entities
for mutations; you opt new items in by calling `add()` and mark items for deletion
with `remove()`. Reach for this page whenever you are persisting data: creating new
list items, updating existing ones, deleting them, or troubleshooting why a save
failed.

## Canonical example

```ts
import {
  DbContext,
  ModelBuilder,
  SpeelEntity,
  initSpeelDbContext,
} from "@speel/core";
import "@speel/pnpjs";

class Task extends SpeelEntity {
  public Title: string | null = null;
  public Status: "Open" | "Done" | null = null;
}

class TaskContext extends DbContext {
  public tasks = this.set(Task);

  protected onModelCreating(builder: ModelBuilder): void {
    builder.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasMaxLength(255);
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Done"]);
    });
  }
}

// In a WebPart's onInit():
const ctx = initSpeelDbContext(TaskContext, (b) =>
  b.useSharePoint(this.context),
);

// --- Create ---
const task = new Task();
task.Title = "Write docs";
task.Status = "Open";
ctx.tasks.add(task);
await ctx.saveChangesAsync();
// task.Id is now set by the server

// --- Update (entity already loaded / tracked) ---
const existing = await ctx.tasks.findAsync(task.Id!);
existing!.Status = "Done";
await ctx.saveChangesAsync();

// --- Delete ---
const toRemove = await ctx.tasks.findAsync(task.Id!);
ctx.tasks.remove(toRemove!);
await ctx.saveChangesAsync();
```

## Capabilities

### Tracking lifecycle

Every entity loaded through a `DbSet` query (`toArrayAsync`, `findAsync`,
`firstOrDefaultAsync`, etc.) is entered into the **identity map** at `EntityState.Unchanged`
with a snapshot of its loaded values. You do not need to call anything to start tracking.

When you call `add(entity)`, the entity enters tracking at `EntityState.Added`
(no snapshot — the item does not yet exist on the server). New items must have `Id` unset
and must not have any read-only property (`Created`, `Modified`, `AuthorId`) set to a
non-`undefined` value; `add()` throws `InvalidOperationException` if either guard fires.

Calling `saveChangesAsync` runs `detectChanges` before flushing. Change detection walks
every `Unchanged` or `Modified` entry and **compares current property values against the
snapshot** using a deep-equal check — `Date` objects are compared by millisecond value,
arrays element-by-element, and `null`/`undefined` are treated as equal. A differing
property moves the entry to `Modified`; a clean entry stays `Unchanged`. Only the
actually-changed columns go out in the update.

What goes out is typed — a `Date` stays a `Date`, a multi-value column is an array — after
the property's `hasCodec({ toProvider, fromProvider })` has run (`toProvider`: the user's
model type mapped to the
field's typed value); the provider owns every wire encoding from there. On an update `null`
clears a column and an empty array clears a multi-value one; an insert omits unset fields.

`EntityState` values, readable via `ctx.changeTracker.entries()`:

| State       | Meaning                                         |
| ----------- | ----------------------------------------------- |
| `Unchanged` | Loaded and not yet mutated                      |
| `Added`     | Staged via `add()`, not yet persisted           |
| `Modified`  | Mutation detected or forced via `update()`      |
| `Deleted`   | Staged via `remove()`, not yet persisted        |
| `Detached`  | Not in the tracker (e.g. created independently) |

Entities loaded via `.asNoTracking()` are `Detached` — they are never entered into the
identity map and changes to them are invisible to the tracker. See
[querying.md](querying.md) for when to use `asNoTracking`.

### `saveChangesAsync`

`await ctx.saveChangesAsync()` runs the full save pipeline over **everything** the context
tracks and returns the number of entities written. To save one thing without the rest of
the pending work, save it through `db.createScope()` ([scopes.md](scopes.md)). The order of
operations:

1. **Relationship fixup (pass 1)** — navigation properties take precedence over FK
   scalars; a changed nav overwrites the FK. See [relationships.md](relationships.md).
2. **`detectChanges`** — compares snapshots; marks dirty entries `Modified`.
3. **Flush (pass 1)** — all `Added`, `Modified`, and `Deleted` entries are batched and
   sent to SharePoint. Within each batch, deletes are ordered before updates, and updates
   before adds — so deletes in a batch are applied before inserts into the same list.
4. **Inverse collection fixup (pass 2)** — children are re-parented (FK columns
   updated) after new parent ids are assigned.
5. **Flush (pass 2)** — child FK changes are flushed.
6. **Permission flush** — staged role-assignment changes are flushed last.

After a successful flush, added entities have their `Id` set from the server response and
return to `Unchanged`; updated entries have their snapshot refreshed; deleted entries are
removed from the tracker entirely.

**`ISaveChangesOptions`** controls the batching behavior:

- `batched` (default `true`) — groups operations into chunks and sends each chunk as a
  single provider batch call. Set to `false` to issue one provider call per operation
  (useful when the provider or target environment doesn't support batching).
- `maxBatchSize` (default `100`) — maximum operations per chunk. A save with 250 pending
  entries and the default splits into three chunks (100 / 100 / 50).
- `continueOnError` (default `false`) — when `false`, the first failing chunk aborts the
  save and throws immediately; already-successful entries stay `Unchanged`. When `true`,
  all chunks run, then a single `DbUpdateException` is thrown with `entries` listing every
  entity that failed.

**Error types** thrown by `saveChangesAsync`:

- **`DbUpdateException`** — one or more entities could not be written. Inspect
  `error.entries` (the `EntityEntry` objects) and `error.innerErrors` (the raw failure
  payloads from the provider) to diagnose which items failed and why.
- **`DbUpdateConcurrencyException`** — extends `DbUpdateException`; reserved for
  conflicts detected at the provider level. The save executor currently sends a
  wildcard ETag (`'*'`) on updates and deletes, so this exception is not thrown
  today. It is exported for future use once conditional ETag behavior is introduced.

### Add, update, and delete

**`add(entity, opts?)`** stages a new entity. Pass `{ folder }` as the second argument
to place the item in a folder. Returns the `EntityEntry<T>` so you can inspect its state.

**`update(entity)`** forces an entity into `Modified` state. Use this when you construct
or receive an entity instance outside the context (e.g. from a form submission) and want
to write it without loading it first. If the entity is already tracked, `update()` just
marks it dirty. If it is not tracked, it is attached with an empty-snapshot baseline so
that every configured non-key property is treated as changed.

**`attach(entity)`** enters an already-loaded entity into tracking at `Unchanged` with a
snapshot of its current values. Use this when you hold an instance that was loaded
outside the change tracker (e.g. deserialized from a cache) and want mutations to be
diffed correctly.

**`remove(entity)`** stages a deletion. If the entity has been loaded into the tracker,
its state moves to `Deleted`. If it is not tracked but has an `Id`, it is attached and
immediately marked `Deleted`. Calling `remove()` on an `Added` entity that has not yet
been saved simply untracks it — nothing is sent to SharePoint.

**Deletes recycle by default.** At save time, `remove(entity)` sends the item to the
site recycle bin, where it can be restored — matching how the migrations layer treats
a dropped list. Pass `remove(entity, { permanent: true })` to destroy it instead.
Core only carries the mode on the delete operation; _acting_ on it is the provider's
job. `@speel/pnpjs` does, but a third-party `IStorageProvider` that ignores the flag
still hard-deletes, whichever mode you ask for.

### Folder placement on add

`add(entity, { folder: 'subfolder/nested' })` stages the new item into a SharePoint
folder within the list. The folder path is list-relative (do not include the list URL);
missing levels are created during save. Folder and file placement need a provider with
the `IFileSystem` capability — `add` refuses at the call, not at save, without one.

**Person columns come along.** Core hands the provider the ids the entity holds; the provider
resolves them to whatever its write API needs (claims Keys, for the form-values API a foldered
add or file upload posts through) and remembers each answer. Any read through that provider
which returned a principal's login — a person `.include()`, a query on a principal set — warms
that cache, so a save after it resolves nothing. Users, groups, single and multi-value columns:
one shape, nothing to configure ([pnpjs principals](../../speel-pnpjs/docs/principals.md)).

### File uploads on add

For document libraries, `add` also takes the file content itself:

```ts
ctx.artifacts.add(doc, {
  folder: "reports/2026",
  file: {
    content: pickedFile,
    onProgress: (p) => setPct(p.bytesUploaded / p.bytesTotal),
  },
});
await ctx.saveChangesAsync();
```

One save uploads the bytes into the folder and applies the entity's fields as the
document's metadata. `content` accepts a browser `File` (its name is used) or a
`Blob`/`ArrayBuffer`/string with an explicit `name`. Large files upload chunked, firing
`onProgress` per chunk; a per-file `signal` cancels an upload between chunks. An
existing file at the path fails the save unless `overwrite: true` is passed. Entities
extending `SpeelDocument` get the stored file name and server-relative URL reflected
back onto `FileLeafRef`/`FileRef` after the save (see [modeling.md](modeling.md)).

### Direct file and folder operations

Six `DbSet` methods act on what is already in SharePoint:

```ts
await ctx.artifacts.ensureFolderAsync("responses/r-1"); // create; idempotent
await ctx.artifacts.deleteFolderAsync("responses/r-1"); // recycle, contents too
await ctx.artifacts.renameFolderAsync("responses/r-1", "r-1-approved");
await ctx.artifacts.renameFileAsync(doc, "q2-final.pdf"); // document libraries
await ctx.artifacts.copyFileToAsync(doc, ctx.archive, "2026", "q2-final.pdf");
await ctx.artifacts.checkinFileAsync(doc, "ready for review");
```

All apply **immediately** rather than at save time: they are direct calls on the
provider's `IFileSystem` (a provider without it throws `InvalidOperationException`
naming the capability), and pending edits still need their own `saveChangesAsync()`.

Folder paths are list-relative — the same shape `add(entity, { folder })` takes,
normalized the same way, with `..` and the list root refused. Folders exist on
plain lists too, not just libraries, so all three folder methods do.

`ensureFolderAsync` creates missing levels and treats an existing folder as
success rather than a collision, leaving its contents alone — so it is safe
ahead of a batch of uploads. `add(entity, { folder })` remains the way to create
a folder as part of a save; this is for folders that must exist on their own.

`deleteFolderAsync` recycles the folder the way `remove()` recycles an item, so
it stays recoverable — but its contents go with it (see the gotcha below).

`renameFileAsync` leaves the document in its current folder and refreshes
`FileLeafRef`/`FileRef` on the entity; the item id, version history, and
permissions survive. `copyFileToAsync` copies into another library's folder as a
**new** item, untracked — read it through the destination set to give it metadata.

`checkinFileAsync` checks a checked-out document back in as a **minor** version
(a draft can be published later; an unwanted publish cannot be recalled) and
clears `CheckedOutById`/`CheckedOutBy` on the entity. The comment is optional.

The document methods refuse a non-`SpeelDocument` entity and an entity with no
`Id`, and the rename methods a name that is really a path — before any request.

### Aborting a save

`saveChangesAsync({ signal })` takes an `AbortSignal`, checked cooperatively between
units of work — batch chunks, file uploads, and chunks within an upload. An abort
rejects with `SaveAbortedException` (so callers can tell a user cancellation from a
failure); everything that already reached SharePoint stays saved and reconciled, and
the rest stays dirty for a clean retry.

## Boundaries & gotchas

- **`add()` throws on set `Id` or read-only fields.** SharePoint assigns `Id` on insert;
  do not set it before calling `add()`. Likewise, never pre-fill `Created`, `Modified`,
  `AuthorId`, or `EditorId` on a new entity — `add()` throws `InvalidOperationException` if
  any read-only property holds a non-`undefined` value. Use `SpeelEntity` (which initializes
  these to `undefined`) rather than classes that zero-initialize them; a read-only field you
  declare yourself must follow suit — `?: number = undefined`, never `| null = null`
  ([modeling.md](modeling.md)).

- **Delete is a SharePoint recycle, not an EF Core hard delete.** `remove()` +
  `saveChangesAsync()` moves the item to the site recycle bin by default; there is no
  "gone" state in between. Only `remove(entity, { permanent: true })` destroys it. This
  has no EF Core equivalent — treat it as a SharePoint-specific delta.

- **Deleting children and their parent is order-independent.** Inverse-collection fixup
  (pass 2) only reconciles FKs for rows that still exist, so a child deleted earlier in
  this save — or in an earlier one — is skipped rather than failing the save, and a
  required FK does not turn its absence into a refusal. A child _joining_ a collection is
  the opposite case: if its row is missing the save throws `DataException`, because the FK
  write you asked for has nowhere to land.

- **No implicit `detectChanges` on the tracker.** The snapshot compare runs as part of
  `saveChangesAsync`, not continuously. If you read `entry.state` directly between saves
  (e.g. for a "dirty" indicator), call `ctx.changeTracker.detectChanges()` first to
  ensure the state is current.

- **`update()` marks every non-key column as dirty.** When you attach an outside entity
  via `update()`, the save sends all non-key columns to SharePoint, not just the ones you
  changed. Load first with `findAsync` and mutate in-place if you only want to write the
  delta.

- **Tracking is per context instance.** Each `initSpeelDbContext` call constructs a new
  context — call it once in `onInit()` and store the result. A second context instance
  has an independent tracker, and the same entity instance tracked by two different
  contexts is not supported.

- **`saveChangesAsync` does not throw on zero changes.** Calling it with nothing pending
  is safe — it returns `0` immediately.

- **Aborts and upload failures never roll back.** A fired request cannot be unsent. If
  metadata application fails after a file upload, the file exists at its URL and the
  error says so; if a save is aborted mid-way, completed chunks stay saved. Re-adding a
  still-unsaved entity is safe: `add()` is idempotent for a tracked Added instance and
  re-stages the current `folder`/`file` options, so a retry uploads what is chosen now.

- **Replacing a document's content is not supported yet.** `file` is an add-only option;
  swapping bytes on an existing document is a planned follow-up.

- **An unresolvable person id fails that entity's write.** SharePoint validates person ids
  on neither of its item APIs — the form-values API answers **200 and stores nothing**, the
  JSON API stores a **dangling reference** — so the provider refuses an id the site
  directory cannot resolve (a removed account, an id from another site collection) on a
  root add, a foldered add, an update and a file upload alike. The save reports it as a
  `DbUpdateException`: a batched write's failure sits in `innerErrors`, and so does the
  `UnresolvedPrincipalException` (from `@speel/pnpjs`) an upload throws before any byte moves.

- **Multi-choice on a foldered add delimits with `;#` and has no escape.** The values go
  over as one `;#`-wrapped list, so a choice whose own text contains `;#` reads back as
  two choices — most often a fill-in value, but a defined choice is no safer. That caveat
  aside the encoding is sound: multi-choice and multi-value lookups both round-trip,
  verified against a live list.

- **A rename onto an occupied name fails, including the current name.** SharePoint has
  no rename verb — a rename is a move within the same parent — and the move is issued
  with overwrite off, so renaming `q2.pdf` to `q2.pdf` is a collision, not a no-op.
  Guard the call (`if (doc.FileLeafRef !== next)`) where the new name may be unchanged.

- **Renaming a folder strands the URLs of everything inside it.** The whole subtree
  moves, and no in-memory entity is told: already-loaded items keep their old
  `FileRef`/`FileDirRef` until they are re-read, and a cached list of them is stale.
  Re-read (or `markCacheStaleAsync()`) after renaming a folder you have items from.

- **Deleting a folder deletes everything under it.** SharePoint recycles a folder as
  one subtree and offers no delete-if-empty on the recycling verb, so every item
  below the path goes with it — recoverable together from the recycle bin, but gone
  from the list. There is no confirmation step and no partial mode: check the folder
  yourself first if "only if empty" is what you meant.

- **Checking in a file that is not checked out is a server error.** There is no
  client-side pre-check, because materialization maps an empty value to `undefined`:
  a document that was loaded and is checked in is indistinguishable from one whose
  `CheckedOutById` was never selected, and guessing would refuse valid check-ins.
  Handle the rejection rather than testing `CheckedOutById` first.

- **Relationships.** Navigation fixup on save and inverse collection handling are covered
  in [relationships.md](relationships.md). Read that page before modelling FK-backed navs
  or collection properties.
