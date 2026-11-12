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

This effort also introduces a standard `Result<T>` type. Core and its sibling
packages have a dozen `*Result` types today, each shaped differently. Folder
creation is the first user of the standard; migrating the others is a follow-up
issue, not this branch.

## Goals

- A standard `Result<T>` and `IError` in `@speel/core`, designed to replace the
  existing ad-hoc result types over time.
- `DbSet.ensureFoldersAsync(paths)`: the multi-path form of `ensureFolderAsync`,
  with a `Result` for every path.
- Round trips grow with folder **depth**, not folder **count**. N root-level
  folders cost one `$batch` (one per 100).
- One bad path never costs the others their result.
- The `IFileSystem` contract states per-path results and allows batching.

## Non-goals

- Migrating the existing `*Result` types (`IBatchOperationResult`,
  `IdentityBatchResult`, `ApplyResult`, `MigrateResult`, …). That is the
  follow-up issue, opened at the end of this branch.
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
- A `Result` shape so tied to folders that the follow-up migration can't use it.

## Design

### 1. `Result<T>` and `IError` (new, `packages/speel-core/src/Result.ts`)

```ts
export interface IError {
  /** Stable, machine-matchable identifier. Branch on this, not on `message`. */
  readonly code: string;
  /** Human-readable, safe to show or log. */
  readonly message: string;
  /** What the error is about: a path, a field name, a clientToken. */
  readonly target?: string;
  /** HTTP status, when the error came from a server response. */
  readonly status?: number;
  /** The underlying error, response body, or upstream IError. Diagnostics only. */
  readonly cause?: unknown;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T; readonly errors?: undefined }
  | {
      readonly ok: false;
      readonly value?: undefined;
      readonly errors: readonly IError[];
    };
```

- **This is the requested shape, `{ ok, value?, errors? }`, written as a
  discriminated union.**
  - `ok` is the discriminant. `value` is present when `ok` is true, and
    `errors` when it is false.
  - Each branch declares the other branch's field as `?: undefined`. So
    `r.value` is readable without narrowing (typed `T | undefined`), and after
    `if (r.ok)` it narrows to `T`.
- **`errors` is never empty** when `ok` is false. The constructor enforces it.
- **`IError` follows the OData / Microsoft REST error object** (`code`,
  `message`, `target`). That is the error SharePoint itself returns, so wire
  errors map onto it without reshaping. `status` and `cause` are added for
  transport facts and diagnostics.
- **`IError` is data, not an exception.** It survives `structuredClone`, crosses
  `postMessage`, and serializes to JSON (except an `Error` sitting in `cause`).
- **Helpers live on a same-named value,** the usual TypeScript type-plus-value
  pairing:

  ```ts
  export const Result = {
    ok<T>(value: T): Result<T>,
    fail<T = never>(error: IError, ...more: IError[]): Result<T>,
    unwrap<T>(r: Result<T>): T, // throws OperationFailedException when !ok
  };
  ```

- **`OperationFailedException`** is a new class in `errors.ts`. It extends
  `Error` and carries `readonly errors: readonly IError[]`. Its message is the
  errors' messages joined. It is how a `Result` becomes a throw at an API that
  throws, such as `ensureFolderAsync`.
- `Result`, `IError` and `OperationFailedException` are exported from
  `@speel/core`, and the core README's conventions section documents the
  standard.

### 2. Folder error codes

The folder operations emit these `IError.code` values. They are string literals,
documented in TSDoc on the method.

| code            | when                                                                | `target`            | extras                                                      |
| --------------- | ------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------- |
| `invalidPath`   | normalization rejects the path (`..`), or it resolves to the root   | the input, as given | —                                                           |
| `requestFailed` | the server rejected creating this folder (or one of its levels)     | normalized path     | `status`, `cause` = raw error                               |
| `notAFolder`    | the name is taken by something that is not a folder (a file)        | normalized path     | —                                                           |
| `parentFailed`  | an ancestor failed, so this path was never attempted                | normalized path     | `cause` = the ancestor's `IError` (whose `target` names it) |
| `noResult`      | the provider returned no result for the path (a contract violation) | normalized path     | —                                                           |

`requestFailed` takes its `message` from the server's error message. Its
`status` is absent when there was no HTTP response for that path, for example
when the whole batch POST failed. `parentFailed`'s message reads
`could not create parent folder '<ancestor>': <ancestor message>`.

**Revision (2026-11-12, after the live probe).** SharePoint answers
AddSubFolderUsingPath on a taken name with HTTP 500 and `odata.error.code`
`-2130245363`. The code is the same in every language (the message is
localized), and the same when a FILE holds the name. Two changes follow:

- "Already exists" is matched on that code, not on English text.
- Each collision is confirmed with one batched `Folder.Exists` read before it
  counts as success. `Exists` is `false` where a file sits, which yields
  `notAFolder`.

The read covers only nodes that collided, so a fresh run costs nothing extra and
a re-run costs one read batch per depth. This narrows the "no pre-reading"
non-goal: there is still no read _before_ creating.

### 3. Public API: `DbSet.ensureFoldersAsync`

```ts
ensureFoldersAsync(folderPaths: readonly string[]): Promise<readonly Result<string>[]>;
```

- **Settled results, aligned to the input.** This is the same model as
  `Promise.allSettled`: `results[i]` belongs to `folderPaths[i]`. `value` is the
  folder's server-relative URL.
- **Same rules as `ensureFolderAsync`.** Paths are list-relative and go through
  `normalizeFolderPath`. An existing folder is success. The call applies
  immediately, not at save time.
- **Per-path failures** use the codes in §2 and never throw.
- **Whole-call throws** (preconditions, not per-path outcomes):
  - The context is disposed.
  - The provider has no file system (`requireFileSystem`).
  - The provider itself throws, for example because the list cannot be
    resolved.
- **Empty input** returns `[]`. The disposed and capability checks still run
  first, so misuse shows up immediately; the provider is not called.
- **Duplicates.** Inputs that normalize to the same path go to the provider
  once. Every input position gets that one result.
- **`ensureFolderAsync(path)` becomes the single-path case:**
  - It keeps its own up-front validation, so root and `..` still throw
    `InvalidOperationException` exactly as today.
  - It then returns `Result.unwrap((await this.ensureFoldersAsync([path]))[0])`.
    A server failure therefore throws `OperationFailedException` instead of the
    provider's raw error, such as a PnPjs `HttpRequestError`. That is a
    deliberate behavior change.

### 4. Provider contract: `IFileSystem.ensureFoldersAsync`

```ts
ensureFoldersAsync(
  list: IListHandle,
  listRelativePaths: readonly string[],
): Promise<ReadonlyMap<string, Result<string>>>;
```

The contract doc states:

- **One result per distinct path.** Input paths are already normalized by core
  but may contain duplicates. The map is keyed by path, which is the same keying
  the contract uses today.
- **Missing levels are created shallowest first.** An existing folder is
  success.
- **Failures stay with their path.** A path's failure goes into its own `Result`
  and must not stop unrelated paths. If an ancestor fails, every path under it
  is `parentFailed`, with the ancestor's error as `cause`.
- **The implementation may batch** (one request per depth, chunked) and may
  create sibling folders in any order within a depth.
- **It throws only when it cannot attempt any path,** for example when the list
  cannot be resolved.
- **Providers build their own errors.** The provider builds the `IError`s, using
  the codes in §2. Core adds `invalidPath` and `noResult`.

This is a breaking change to a provider interface. Under 0.x it ships as a
`minor` changeset (the six packages version as one group).

### 5. Save path (`add(entity, { folder })`)

`SaveExecutor` already dedupes target folders per list and calls the contract
once per list. It now reads each `Result`. If any folder failed, it throws a
`DbUpdateException` **before any item op runs**:

- The exception lists every entry whose target folder failed, not just the
  first.
- Its `errors` carry those folders' `IError`s.
- Its message names each failed folder and its error message.

This replaces today's behavior, where the provider's raw error escaped
unwrapped. Folders created before the failure stay, as they do today; creation
is idempotent.

### 6. pnpjs provider: batch by depth

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
     - Any other rejection: the node failed with a `requestFailed` `IError`.
       Pull `status` and the server message out of the PnPjs error the same way
       `SharePointProvider.toFailure` does. Lift that extraction into a shared
       helper instead of duplicating it.
   - If `execute()` itself rejects (the batch POST failed), every node in the
     chunk fails with `requestFailed`, built from that error.

   Chunks within a depth run one after another, which is gentler on
   throttling. Nodes whose parent failed are never sent.

4. **Map back to paths.**
   - Every node on the path succeeded: `Result.ok(`${rootUrl}/${path}`)`.
   - The path's own node failed: that node's `requestFailed`, with `target`
     set to the path.
   - A proper ancestor failed: `parentFailed`, with the shallowest failed
     node's error as `cause`.

The parent is addressed by server-relative path instead of by chaining from
`list.rootFolder`. `AddSubFolderUsingPath` on a folder inside a list creates a
list folder (one backed by an item) either way. The live check below confirms
that.

**Round trips:** 1 (cached root) + depth × ⌈nodes at that depth / 100⌉. 25
root-level folders cost one request. 25 folders under one existing parent cost
two: the parent's "already exists", then the 25 children.

### 7. Test fakes

- **`FakeStorageProvider`** implements the new contract. It gains a
  failure-injection hook for folder creation (list-relative paths that fail
  with a given `status` and message), so tests can drive the parent-fails path.
  `failOn(clientToken, …)` is the existing pattern; follow its style.
- **The `speel-react` fake provider** (`test/fakeProvider.ts`) moves to the new
  return shape.
- **The provider conformance suite** (`testing/conformance`) moves to the new
  shape. It adds a case that ensures a new and an existing path in one call
  and expects both `ok`.

## Tests

**`Result` (`Result.test.ts`):**

- `ok` and `fail` produce the right shapes.
- `fail` requires at least one error (a type-level check plus a runtime check).
- `unwrap` returns the value, or throws `OperationFailedException` carrying the
  errors.
- Narrowing compiles: `value` is `T` after `if (r.ok)`.

**Core (`DbSet.folderOps.test.ts` and new cases), against
`FakeStorageProvider`:**

- New and existing paths mixed: every result is `ok`, with correct URLs, in
  input order.
- A nested path whose parent fails:
  - The parent is `requestFailed`.
  - Its children are `parentFailed`, with `cause.target` naming the parent.
  - Unrelated paths are `ok`.
- Duplicates, including ones that only match after normalization (`a/b` and
  `/a/b/`): one provider call per distinct path, and both positions get the
  same result.
- Empty input returns `[]` and the provider is not called.
- `..` and root are `invalidPath`, with the raw input as `target`. The other
  paths still run.
- A provider that omits a path yields `noResult`.
- `ensureFolderAsync`:
  - It still throws `InvalidOperationException` for root and for `..`.
  - A provider failure throws `OperationFailedException`.
  - Success still returns the URL.
- Save path: `add({ folder })` with one failing folder throws a
  `DbUpdateException`:
  - It lists the affected entries, with their `IError`s.
  - No item op ran.

**pnpjs (`SharePointProvider.folder.test.ts`), with a faked SPFI:**

- Requests are grouped by depth: N root-level paths produce one batch with N
  sub-requests.
- 101 nodes at one depth are split into two batches.
- An "already exists" rejection counts as success, and its children are still
  created.
- A failed parent means the child is never sent, and the child is
  `parentFailed`.
- A rejected `execute()` makes every node in that chunk `requestFailed`.
- `requestFailed` carries the PnPjs error's `status` and the server message.

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
- The invalid path is `requestFailed` with a `status`, and its child is
  `parentFailed`. The failure did not stop the rest of the batch, which
  confirms SharePoint keeps processing a `$batch` after a failed sub-request.
- Each created folder is a list folder: a `FSObjType=1` item exists at its
  `FileRef`.
- Cleanup recycles the test root with `deleteFolderAsync`.

If the live run shows the exists-error text differs, fix `isFolderExistsError`
and update its comment to say it was verified, with the date.

## Docs

The branch's single document step updates:

- **`packages/speel-core/docs/files.md`:**
  - Capabilities gains `ensureFoldersAsync` and its per-path `Result`s.
  - Boundaries & gotchas covers partial success with no rollback, the cost
    model (round trips scale with depth), and the error codes.
- **`packages/speel-core/README.md`:** the conventions section gains a short
  "Results" entry covering `Result<T>`, `IError`, `Result.unwrap`, and the rule
  to branch on `code`, not `message`.

The canonical example in `files.md` changes only if it currently shows a loop of
`ensureFolderAsync` calls.

## Follow-up (last task on this branch)

Open a GitHub issue to migrate the existing result types onto `Result<T>` /
`IError`. It should list each type with its package and file:

- core: `IBatchOperationResult`, `IReadOperationResult`, `IFileUploadResult`,
  `IRenameResult`;
- identity: `IdentityBatchResult`, `IdentitySaveResult`, `ApplyResult`;
- migrations: `MigrateResult`, `SchemaOpResult`, `ListResult`;
- react: `MigrationResult`, `SurfaceResult`.

It should also note that some of these are plain value bags, not
success-or-failure results. Those stay as the `T` inside a `Result<T>` rather
than being replaced, and the issue should say which is which.

## Left to the builder

- Internal helper names and module placement for the shared batch limit and the
  PnPjs error extraction.
- Exact wording of the error messages, within the rules above.
- Whether the fake's failure hook keys on a path or a predicate.
