# Files and folders

## What & when

SharePoint lists have folders, and document libraries hold files. Core reaches both through
the same `DbSet` you save items with: `add()` can place a new item in a folder and upload a
document's bytes as part of `saveChangesAsync()`, and a handful of `DbSet` methods act on
files and folders that already exist. Reach here when an entity lives in a document library
(extends `SpeelDocument`), when items belong in folders, or when a file must be renamed,
copied, checked in, or cleaned up. Everything here needs a provider with the `IFileSystem`
capability — `@speel/pnpjs` has it.

## Canonical example

```ts
import {
  DbContext,
  Entity,
  SpeelDocument,
  TextField,
  initSpeelDbContext,
} from "@speel/core";
import "@speel/pnpjs";

// Extending SpeelDocument makes the list a document library.
@Entity({ list: "Artifacts" })
class Artifact extends SpeelDocument {
  @TextField({ displayName: "Title" }) public Title: string | null = null;
}

class ArtifactContext extends DbContext {
  public artifacts = this.set(Artifact);
}

const ctx = initSpeelDbContext(ArtifactContext, (b) =>
  b.useSharePoint(this.context),
);

// Upload into a folder; the entity's fields become the document's metadata.
const doc = Object.assign(new Artifact(), { Title: "Q2 report" });
ctx.artifacts.add(doc, {
  folder: "reports/2026",
  file: { content: pickedFile }, // a browser File: its name is used
});
await ctx.saveChangesAsync();
// doc.FileLeafRef / doc.FileRef now hold the stored name and URL.

// Act on what is already there — these apply immediately, not at save.
await ctx.artifacts.renameFileAsync(doc, "q2-final.pdf");
await ctx.artifacts.checkinFileAsync(doc, "ready for review");
```

## Capabilities

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

## Boundaries & gotchas

- **Replacing a document's content is not supported yet.** `file` is an add-only option;
  swapping bytes on an existing document is a planned follow-up.

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
