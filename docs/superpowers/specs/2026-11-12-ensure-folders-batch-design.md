# Batched folder creation with a result per path (#118)

## Intent

Creating many folders costs one round trip per folder today, which is too slow
for bulk work in the browser. A typical case is a batch of ~25 sibling folders,
repeated across runs of a few hundred items. Re-runs after a partial failure are
routine, so they hit folders that already exist.

Three problems with the current code:

1. `DbSet` only has `ensureFolderAsync(path)`, so N folders take N calls.
2. The pnpjs `ensureFoldersAsync` awaits `addSubFolderUsingPath` once per segment
   per path. N root-level folders still take N sequential round trips.
3. One failing path throws, and every path after it is abandoned.

## Goals

- `DbSet.ensureFoldersAsync(paths)`: the multi-path form of `ensureFolderAsync`,
  with a result for every path.
- Round trips grow with folder **depth**, not folder **count**. N root-level
  folders cost one `$batch` (one per 100).
- One bad path never costs the others their result.
- The `IFileSystem` contract states per-path results and allows batching.

## Non-goals

- Rolling back folders already created when a sibling or descendant fails.
  Creation is idempotent, so a re-run is the recovery path.
- `AbortSignal`, progress callbacks, or concurrency control beyond the batch
  chunking.
- Batching any other folder operation (rename, delete).
- Pre-reading which folders exist. Existence comes from the create response.

## Anti-goals

- A partial failure that throws and loses the per-path outcomes.
- A child path that reports success while its parent failed.
- Changing what `add(entity, { folder })` guarantees: a save whose folder cannot
  be ensured still fails before any item is written.

## Design

### 1. Public API: `DbSet.ensureFoldersAsync`

```ts
type EnsureFolderResult =
  | { readonly path: string; readonly ok: true; readonly serverRelativeUrl: string }
  | { readonly path: string; readonly ok: false; readonly error: Error };

ensureFoldersAsync(folderPaths: readonly string[]): Promise<readonly EnsureFolderResult[]>;
```

- **Shape: settled results, aligned to the input.** This is the same model as
  `Promise.allSettled`: `results[i]` belongs to `folderPaths[i]`, and `path`
  echoes that input exactly as the caller passed it, so callers can match on it
  either way. A discriminated `ok` makes failures impossible to ignore without
  narrowing. `EnsureFolderResult` is exported from `@speel/core`.
- **Same rules as `ensureFolderAsync`.** Paths are list-relative and go through
  `normalizeFolderPath`. An existing folder is success. The call applies
  immediately, not at save time.
- **Per-path errors** (an entry with `ok: false`, never a throw):
  - A path that normalization rejects (for example a `..` segment): the
    `InvalidOperationException` it raised.
  - A path that resolves to the list root (`""`, `"/"`):
    `InvalidOperationException`, the same check `ensureFolderAsync` makes today.
  - A path the provider failed to create, or a path whose ancestor failed.
  - A path the provider returned no result for (a contract violation):
    `InvalidOperationException` naming it.
- **Whole-call throws** (preconditions, not per-path outcomes):
  - The context is disposed.
  - The provider has no file system (`requireFileSystem`).
  - The provider itself throws, for example because the list cannot be
    resolved.
- **Empty input** returns `[]`. The disposed and capability checks still run
  first, so misuse shows up immediately; the provider is not called.
- **Duplicates.** Inputs that normalize to the same path go to the provider
  once. Every input position gets that one outcome, with its own `path` echo.
- **`ensureFolderAsync(path)` becomes the single-path case.** It calls
  `ensureFoldersAsync([path])`, throws `result.error` when `!ok`, and otherwise
  returns `serverRelativeUrl`. Callers see the same error type as today; message
  text may now name the multi-path method.

### 2. Provider contract: `IFileSystem.ensureFoldersAsync`

```ts
type FolderOutcome =
  | { readonly ok: true; readonly serverRelativeUrl: string }
  | { readonly ok: false; readonly error: Error };

ensureFoldersAsync(
  list: IListHandle,
  listRelativePaths: readonly string[],
): Promise<ReadonlyMap<string, FolderOutcome>>;
```

The contract doc states:

- Input paths are already normalized by core, but may still contain duplicates.
  The result has one entry per **distinct** input path, keyed by that path.
- Missing levels are created shallowest first. An existing folder is success.
- A path's failure goes into that path's entry and must not stop unrelated
  paths. If an ancestor fails, every path under it fails too, with an error that
  names the failed ancestor.
- The implementation **may batch** (one request per depth, chunked) and may
  create sibling folders in any order within a depth.
- It throws only when it cannot attempt any path, for example when the list
  cannot be resolved.

`FolderOutcome` is exported from `@speel/core` alongside the other provider
contract types. This is a breaking change to a provider interface. Under 0.x it
ships as a `minor` changeset (the six packages version as one group).

### 3. Save path (`add(entity, { folder })`)

`SaveExecutor` already dedupes target folders per list and calls the contract
once per list. It now reads the outcome map. If any folder failed, it throws a
`DbUpdateException` **before any item op runs**:

- The exception lists every entry whose target folder failed, not just the
  first.
- Its message names each failed folder and that folder's error message.
- The first failure's error is kept as the cause.

This replaces today's behavior, where the provider's raw error escaped
unwrapped. Folders created before the failure stay, as they do today; creation
is idempotent.

### 4. pnpjs provider: batch by depth

`SharePointFileSystem.ensureFoldersAsync`:

1. **Resolve the list root URL** once (cached, as today). If this fails, the
   whole call throws.
2. **Expand paths into nodes.** Each node is a distinct prefix (`a`, `a/b`,
   `a/b/c`) grouped by depth. Prefixes shared between paths become one node.
   Stray empty segments are skipped, as today.
3. **Create one depth at a time, shallowest first.** At depth _d_, take every
   node whose parent succeeded (the parent of a depth-1 node is the list root).
   Split them into chunks of at most `BATCH_REQUEST_LIMIT` (100). Hoist that
   constant out of `SharePointProvider.ts` into a module both files import.
   For each chunk:
   - Open `sp.batched({ maxRequests: BATCH_REQUEST_LIMIT })`.
   - Enrol one request per node, **synchronously**, before `execute()`:
     `sp2.web.getFolderByServerRelativePath(parentUrl).addSubFolderUsingPath(leaf)`.
     In PnPjs 4.20 this is a single POST, and the `getByUrl` it returns sends
     nothing.
   - Attach rejection handlers to every promise before awaiting `execute()`,
     so there are no unhandled rejections.
   - Await `execute()`, then settle each promise:
     - Success, or a rejection that `isFolderExistsError` matches: the node
       succeeded.
     - Any other rejection: the node failed with that error.
   - If `execute()` itself rejects (the batch POST failed), every node in the
     chunk fails with that error.

   Chunks within a depth run one after another, which is gentler on
   throttling. Nodes whose parent failed are never sent: they inherit the
   failure.

4. **Map back to paths.**
   - Every node on the path succeeded: `ok` with `${rootUrl}/${path}`.
   - Otherwise the path fails with its shallowest failed node's error. If that
     node is a proper ancestor, wrap the error in one whose message reads
     `could not create parent folder '<ancestor>': <original message>`, with the
     original attached as `cause`.

     ES2020 lib has no `ErrorOptions`, so set `cause` as a property.

The parent is addressed by server-relative path instead of by chaining from
`list.rootFolder`. `AddSubFolderUsingPath` on a folder inside a list creates a
list folder (one backed by an item) either way. The live check below confirms
that.

**Round trips:** 1 (cached root) + depth × ⌈nodes at that depth / 100⌉. 25
root-level folders cost one request. 25 folders under one existing parent cost
two: the parent's "already exists", then the 25 children.

### 5. Test fakes

- **`FakeStorageProvider`** implements the new contract. It gains a
  failure-injection hook for folder creation (a set of list-relative prefixes
  that fail with a given error), so tests can drive the parent-fails path.
  `failOn(clientToken, …)` is the existing pattern; follow its style.
- **The `speel-react` fake provider** (`test/fakeProvider.ts`) moves to the new
  return shape.
- **The provider conformance suite** (`testing/conformance`) moves to the new
  shape. It adds a case that ensures a new and an existing path in one call
  and expects both `ok`.

## Tests

**Core (`DbSet.folderOps.test.ts` and new cases), against
`FakeStorageProvider`:**

- New and existing paths mixed: every result is `ok`, with correct URLs, in
  input order.
- A nested path whose parent fails: that path and its siblings under the same
  parent fail, the error names the parent, and unrelated paths succeed.
- Duplicates, including ones that only match after normalization (`a/b` and
  `/a/b/`): one provider call per distinct path, and each position echoes its
  own input.
- Empty input returns `[]` and the provider is not called.
- An invalid path (`..`, root) is a per-path error; the other paths still run.
- `ensureFolderAsync` still throws for root, for `..`, and when the provider
  fails, and still returns the URL on success.
- Save path: `add({ folder })` with one failing folder throws a
  `DbUpdateException` listing the affected entries, and no item op ran.

**pnpjs (`SharePointProvider.folder.test.ts`), with a faked SPFI:**

- Requests are grouped by depth: N root-level paths produce one batch with N
  sub-requests.
- 101 nodes at one depth are split into two batches.
- An "already exists" rejection counts as success, and its children are still
  created.
- A failed parent means the child is never sent and inherits a wrapped error.
- A rejected `execute()` fails every node in that chunk.

**Live tenant (one Playwright spec in `samples/spfx-sample/tests`, following
`folderPlacement.spec.ts`; PW_E2E only):**

One `ensureFoldersAsync` call on a run-scoped test root under the Projects list.
The call mixes:

- an existing folder,
- several new root-level siblings,
- a new nested path under the existing folder,
- a path with a SharePoint-invalid segment, plus a child under it.

Assertions:

- Every valid path is `ok`, with the correct URL. This confirms that
  `isFolderExistsError` matches the real "already exists" response inside a
  `$batch`, or that the verb is idempotent.
- The invalid path and its child fail, and the failure did not stop the rest of
  the batch. This confirms SharePoint keeps processing a `$batch` after a failed
  sub-request.
- Each created folder is a list folder: a `FSObjType=1` item exists at its
  `FileRef`.
- Cleanup recycles the test root with `deleteFolderAsync`.

If the live run shows the exists-error text differs, fix `isFolderExistsError`
and update its comment to say it was verified, with the date.

## Docs

The branch's single document step updates `packages/speel-core/docs/files.md`:

- Capabilities gains `ensureFoldersAsync` and its per-path results.
- Boundaries & gotchas covers partial success with no rollback, and the cost
  model (round trips scale with depth).

The canonical example changes only if it currently shows a loop of
`ensureFolderAsync` calls.

## Left to the builder

- Internal helper names and module placement for the shared batch limit.
- Exact wording of the error messages, within the rules above.
- Whether the fake's failure hook keys on a path prefix or a predicate.
