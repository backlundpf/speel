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
model type mapped to the field's typed value); the provider owns every wire encoding from there. On an update `null`
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
- **`DbUpdateConcurrencyException`** — extends `DbUpdateException`; reserved for provider-level
  conflicts. Updates and deletes currently send a wildcard ETag (`'*'`), so it is not thrown
  today; it is exported for when conditional ETags are introduced.

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

### Folders and files

`add(entity, { folder })` places a new item in a list folder, `add(entity, { file })` uploads
a document's bytes in the same save, and `DbSet` methods create, rename, copy, check in, and
delete files and folders directly. All of it is on [files and folders](files.md).

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

- **An unresolvable person id fails that entity's write.** SharePoint validates person ids
  on neither of its item APIs — the form-values API answers **200 and stores nothing**, the
  JSON API stores a **dangling reference** — so the provider refuses an id the site
  directory cannot resolve (a removed account, an id from another site collection) on a
  root add, a foldered add, an update and a file upload alike. The save reports it as a
  `DbUpdateException`: a batched write's failure sits in `innerErrors`, and so does the
  `UnresolvedPrincipalException` (from `@speel/pnpjs`) an upload throws before any byte moves.

- **Relationships.** Navigation fixup on save and inverse collections are covered in
  [relationships.md](relationships.md) — read it before modelling FK-backed navs or collections.
