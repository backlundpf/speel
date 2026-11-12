# Batched ensureFoldersAsync + standard Result<T> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standard `Result<T>`/`IError` to `@speel/core` and use it to give
`DbSet.ensureFoldersAsync(paths)` one result per path. The pnpjs provider creates
the folders in one `$batch` per depth.

**Architecture:**

- **Core:** gains `Result.ts` (the type, its helpers, and `OperationFailedException`
  in `errors.ts`).
- **Contract:** the `IFileSystem.ensureFoldersAsync` contract changes to
  `ReadonlyMap<path, Result<string>>`.
- **Core consumers:** `DbSet`, `SaveExecutor`, the fake provider and the
  conformance suite consume the new contract.
- **pnpjs:** `SharePointFileSystem` is rewritten to expand paths into prefix
  nodes and create them one depth at a time, in batches of up to 100.

**Tech Stack:** TypeScript (ES2020 lib, NodeNext), vitest, PnPjs 4.20, Playwright
(live check only), Changesets.

**Spec:** `docs/superpowers/specs/2026-11-12-ensure-folders-batch-design.md`.
Read it before starting any task.

## Global Constraints

- The repo is public. Nothing committed may name an external consumer app, org,
  tenant or account. Use `contoso` / `example.sharepoint.com`.
- Relative imports carry `.js`. Package tsconfigs are NodeNext, and
  `npm run check:node-esm` must pass.
- The lib is ES2020, so there is no `ErrorOptions`/`cause` constructor
  argument. Set `cause` as a plain property where needed.
- `Result<T>` exactly:

  ```ts
  | { readonly ok: true; readonly value: T; readonly errors?: undefined }
  | { readonly ok: false; readonly value?: undefined; readonly errors: readonly IError[] }
  ```

  `errors` is never empty.

- `IError` fields exactly: `code: string`, `message: string`, `target?: string`,
  `status?: number`, `cause?: unknown`, all `readonly`.
- The folder error codes are exactly `invalidPath`, `requestFailed`,
  `parentFailed` and `noResult`. `parentFailed`'s message is
  `could not create parent folder '<ancestor>': <ancestor message>`.
- The batch chunk size is `BATCH_REQUEST_LIMIT = 100`. It is also passed as
  `sp.batched({ maxRequests })`.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The final gate is `npm run verify` **and** `npm run format:check`. CI runs
  format separately.
- Downstream packages (`@speel/pnpjs`, `@speel/react`, the sample) resolve
  `@speel/core` from its **dist**. Run `npm -w @speel/core run build` before
  running their tests.

## Review Focus

1. **Names with spaces, `#`, `%` or `'`** (`it's #1/a b`). These must reach
   SharePoint as the raw decoded names, so `getFolderByServerRelativePath` and
   `addSubFolderUsingPath` receive raw strings and do the encoding themselves.
   The URL in the result is the raw composed path. Test: Task 4, step 1,
   `passes raw names to the PnPjs path APIs`.
2. **Case-only duplicates in one call** (`Responses/a`, `responses/b`).
   SharePoint names are case-insensitive. `Responses` and `responses` are two
   nodes in the same depth-1 batch, and one of them comes back "already
   exists". Expected: both paths `ok`, each URL echoing the caller's casing,
   and both children created. Test: Task 4, step 1,
   `case-only duplicates both succeed`.
3. **A path that is also a prefix of another path in the same call** (`a`,
   `a/b`). `a` is created once and both results are `ok`. Test: Task 3, step 1,
   `a path that is another path's prefix is created once`.
4. **"Already exists" for a file, not a folder.** A plain `"already exists"`
   match also catches "a file with that name already exists". A folder path
   would then report `ok` while a file blocks it. Task 6 captures SharePoint's
   real message for the folder case. If the folder message has a distinctive
   phrase, Task 6 narrows `isFolderExistsError` to it.
5. **Whole-call failure from `DbSet`** (the list can't be resolved). This must
   reject the promise, not return failures. Test: Task 3, step 1,
   `rejects when the provider cannot attempt any path`.

---

### Task 1: `Result<T>`, `IError`, `OperationFailedException`

**Files:**

- Create: `packages/speel-core/src/Result.ts`
- Modify: `packages/speel-core/src/errors.ts` (append the class)
- Modify: `packages/speel-core/src/index.ts`. Export `Result` (value and type)
  and `IError` from `./Result.js`, and add `OperationFailedException` to the
  existing `./errors.js` export list (lines 155-162).
- Test: `packages/speel-core/test/unit/Result.test.ts`

**Interfaces:**

- Produces:
  - `type Result<T>` and `interface IError` (shapes in Global Constraints).
  - `const Result: { ok<T>(value: T): Result<T>; fail<T = never>(error: IError, ...more: IError[]): Result<T>; unwrap<T>(r: Result<T>): T }`.
  - `class OperationFailedException extends Error { readonly errors: readonly IError[] }`.
    Its `name` is `"OperationFailedException"`, and its message is the errors'
    `message`s joined with `"; "`.

- [ ] **Step 0: Prepare the worktree.**
  - Run `npm install --cache "$TMPDIR/npm-cache"` at the worktree root. That
    command is in memory: the sandbox npm cache.
  - Then run `npm -w @speel/core run build`.
  - Confirm that `node -e "console.log(require.resolve('@speel/core/package.json'))"`
    resolves inside this worktree. If it points at the main checkout, re-point
    `node_modules/@speel` (memory: fresh worktree verify gaps).
  - Expected: install ok, build ok.

- [ ] **Step 1: Write the failing tests.** `Result.test.ts`:

```ts
import { describe, it, expect, expectTypeOf } from "vitest";
import { Result, type IError } from "../../src/Result.js";
import { OperationFailedException } from "../../src/errors.js";

const e1: IError = {
  code: "requestFailed",
  message: "boom",
  target: "a",
  status: 500,
};
const e2: IError = { code: "parentFailed", message: "nope" };

describe("Result", () => {
  it("ok carries the value and no errors", () => {
    expect(Result.ok(42)).toEqual({ ok: true, value: 42 });
  });
  it("fail carries every error and no value", () => {
    expect(Result.fail(e1, e2)).toEqual({ ok: false, errors: [e1, e2] });
  });
  it("fail requires at least one error", () => {
    // @ts-expect-error — zero errors is a type error
    expect(() => Result.fail()).toThrow(/at least one/i);
  });
  it("unwrap returns the value of an ok result", () => {
    expect(Result.unwrap(Result.ok("x"))).toBe("x");
  });
  it("unwrap throws OperationFailedException carrying the errors", () => {
    const r = Result.fail<string>(e1, e2);
    expect(() => Result.unwrap(r)).toThrow(OperationFailedException);
    try {
      Result.unwrap(r);
    } catch (err) {
      expect((err as OperationFailedException).errors).toEqual([e1, e2]);
      expect((err as Error).message).toBe("boom; nope");
      expect((err as Error).name).toBe("OperationFailedException");
    }
  });
  it("value is readable unnarrowed and narrows to T on ok", () => {
    const r = Result.ok(1) as Result<number>;
    expectTypeOf(r.value).toEqualTypeOf<number | undefined>();
    if (r.ok) expectTypeOf(r.value).toEqualTypeOf<number>();
    else expectTypeOf(r.errors).toEqualTypeOf<readonly IError[]>();
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail.**
  - Run: `npm -w @speel/core exec -- vitest run test/unit/Result.test.ts`
  - Expected: FAIL, because `../../src/Result.js` cannot be resolved.

- [ ] **Step 3: Implement `Result.ts`, and add `OperationFailedException` to
      `errors.ts`.**
  - TSDoc on `Result` states the standard: branch on `ok`, match on
    `IError.code` (never `message`), `errors` is never empty, and `IError` is
    data, not an exception.
  - `fail` throws `InvalidOperationException("Result.fail requires at least one error.")`
    when it is called with none at runtime.
  - Add the index exports.

- [ ] **Step 4: Run the tests and the type check, and watch them pass.**
  - Run: `npm -w @speel/core exec -- vitest run test/unit/Result.test.ts && npm -w @speel/core run test:types`
  - Expected: PASS. The `@ts-expect-error` is satisfied.

- [ ] **Step 5: Commit.**
      `git add packages/speel-core/src/Result.ts packages/speel-core/src/errors.ts packages/speel-core/src/index.ts packages/speel-core/test/unit/Result.test.ts`
      then
      `git commit -m "feat(core): standard Result<T>, IError and OperationFailedException (#118)"`

---

### Task 2: Provider contract → `Result`, with the fake, the conformance suite, the save path and a minimal pnpjs adapter

The contract change and every implementation of it land together so that every
package still compiles. The pnpjs adapter here is the **minimal** one: the
existing sequential loop, with a catch per path. Task 4 replaces it.

**Files:**

- Modify: `packages/speel-core/src/providers/ISharePointProvider.ts:287-296`.
  Change the `IFileSystem.ensureFoldersAsync` signature and its TSDoc to the
  contract text in spec §4. Add the exported type
  `FolderErrorCode = "invalidPath" | "requestFailed" | "parentFailed" | "noResult"`
  with TSDoc for each code (spec §2), and export it from `index.ts`.
- Modify: `packages/speel-core/src/testing/FakeStorageProvider.ts:1034-1072`
  (`ensureFoldersAsync`, plus a new hook next to `failOn` at line 802).
- Modify: `packages/speel-core/src/Save/SaveExecutor.ts:157-177`
- Modify: `packages/speel-core/src/testing/conformance/providerConformance.ts:213-218`.
  `folderUrl()` unwraps the result. Add one conformance case.
- Modify: `packages/speel-react/test/fakeProvider.ts:233-236`. Return
  `new Map(paths.map(p => [p, Result.ok(url)]))`.
- Modify: `packages/speel-pnpjs/src/SharePointFileSystem.ts:64-94`. This is the
  minimal per-path `Result`. A caught non-exists error becomes
  `Result.fail({ code: "requestFailed", message, target: path, status, cause: err })`.
- Modify: `packages/speel-pnpjs/src/SharePointProvider.ts:1120-1125`
  (the delegating signature).
- Test: `packages/speel-core/test/unit/fakes/FolderProvider.test.ts`,
  `packages/speel-core/test/unit/Save/` (a new file,
  `SaveExecutor.folderFailure.test.ts`), and
  `packages/speel-pnpjs/test/SharePointProvider.folder.test.ts`.

**Interfaces:**

- Consumes: `Result`, `IError` (Task 1).
- Produces:
  - `IFileSystem.ensureFoldersAsync(list: IListHandle, listRelativePaths: readonly string[]): Promise<ReadonlyMap<string, Result<string>>>`.
  - `type FolderErrorCode`.
  - `FakeStorageProvider.failFolderOn(listRelativePath: string, failure: { status: number; message: string }): void`.
    The path and every path under it fail: the path itself with
    `requestFailed`, and paths under it with `parentFailed`, whose `cause` is
    the path's `IError`. Nothing at or under that path is materialized. A
    sibling path is unaffected.

- [ ] **Step 1: Write the failing tests.**

In `FolderProvider.test.ts`, add a `describe("ensureFoldersAsync results")`
block:

- `returns ok with the server-relative URL per distinct path`:
  `ensureFoldersAsync(list, ["a/b", "c"])`. Both `.get(p)` are
  `{ ok: true, value: "/sites/dev/<list>/<p>" }`.
- `an existing folder is ok`: call twice and compare the second result with
  `ok: true`.
- `failFolderOn fails the path and its descendants, not siblings`:
  - Call `failFolderOn("a/b", { status: 403, message: "Access denied." })`,
    then ensure `["a/b", "a/b/c", "a/x"]`.
  - `get("a/b")` matches
    `{ ok: false, errors: [{ code: "requestFailed", status: 403, target: "a/b", message: "Access denied." }] }`.
  - `get("a/b/c")!.errors![0]` matches `{ code: "parentFailed", target: "a/b/c" }`.
    Its `message` is `"could not create parent folder 'a/b': Access denied."`,
    and its `cause` matches `{ target: "a/b" }`.
  - `get("a/x")!.ok` is `true`.
  - `getFolders(list)` contains `"a"` and `"a/x"`, but not `"a/b"` or
    `"a/b/c"`.

In `SaveExecutor.folderFailure.test.ts`, model the setup on
`SaveExecutor.fileLeafRef.test.ts`. One test,
`a failed folder fails the save before any item op, listing every affected entry`:

- Set up two entities with `add(e, { folder: "bad" })`, one with
  `{ folder: "good" }`, and `provider.failFolderOn("bad", { status: 403, message: "Access denied." })`.
- Expect `saveChangesAsync()` to reject with a `DbUpdateException`.
- `entries` holds exactly the two `bad` entries, and `innerErrors` holds their
  `IError`s (`code: "requestFailed"`).
- The message contains `bad` and `Access denied.`.
- The `good` entity was **not** inserted. The provider's store for the list
  has no non-folder rows.

In `SharePointProvider.folder.test.ts`:

- Change `ensureFoldersAsync creates each level…`: `map.get("a/b/c")` is now
  `{ ok: true, value: "/sites/dev/Docs/a/b/c" }`.
- Replace `rethrows errors that are not folder-already-exists` with
  `a non-exists error is that path's requestFailed result`. It resolves, and
  `map.get("a")` matches
  `{ ok: false, errors: [{ code: "requestFailed", status: 403, target: "a", message: "Access denied." }] }`.
- Keep the root-URL test unchanged: it still rejects.

- [ ] **Step 2: Run the tests and watch them fail.**
  - Run: `npm -w @speel/core exec -- vitest run test/unit/fakes/FolderProvider.test.ts test/unit/Save/SaveExecutor.folderFailure.test.ts`
  - Expected: FAIL, because `failFolderOn` is not a function and the result
    shape doesn't match.

- [ ] **Step 3: Implement the contract change and all four implementations.**
  - **Fake:**
    - Process the distinct paths.
    - Before creating a level, check whether it equals a `failFolderOn` path:
      - If it does, record that level's `requestFailed` `IError`. Every input
        path at or under it gets `requestFailed` (when the path _is_ the
        level) or `parentFailed` (when it is below the level).
      - Otherwise, create the level as today.
  - **SaveExecutor:**
    - Read `resolved.get(path)`.
    - Collect every entry whose result is missing or `!ok`. A missing result
      is `IError` `{ code: "noResult", target: path }`.
    - When any were collected, throw
      `new DbUpdateException(msg, failedEntries, failedErrors)`. The message is
      `"Could not ensure folder(s) for add({ folder }): " + "'<path>': <message>"`,
      joined with `"; "`, one per distinct failed folder.
    - Throw before `pending` is built.
  - **pnpjs minimal:** for the error message and status, use
    `(err as { message?: string }).message ?? String(err)` and
    `(err as { status?: number }).status`. Task 4 replaces this.

- [ ] **Step 4: Run the core tests, then build core and run the downstream
      tests.**
  - Run: `npm -w @speel/core test && npm -w @speel/core run build && npm -w @speel/pnpjs test && npm -w @speel/react test`
  - Expected: all pass, including the existing `DbSet.folderOps.test.ts`.
    `ensureFolderAsync` still compiles against the new map: update its body
    minimally to `Result.unwrap(urls.get(path) ?? Result.fail(noResult))`.
    Task 3 reshapes it.

- [ ] **Step 5: Commit.**
      `git commit -m "feat(core,pnpjs)!: IFileSystem.ensureFoldersAsync returns a Result per path (#118)"`

---

### Task 3: `DbSet.ensureFoldersAsync` (public, input-aligned)

**Files:**

- Modify: `packages/speel-core/src/DbSet.ts:526-563`. Add `ensureFoldersAsync`
  above `ensureFolderAsync`, and turn `ensureFolderAsync` into its single-path
  case.
- Test: `packages/speel-core/test/unit/DbSet.folderOps.test.ts` (a new
  `describe("DbSet.ensureFoldersAsync")`, reusing the file's `buildModel` and
  `beforeEach`).

**Interfaces:**

- Consumes: the Task 2 contract, `Result`, and `FakeStorageProvider.failFolderOn`.
- Produces:
  `DbSet<T>.ensureFoldersAsync(folderPaths: readonly string[]): Promise<readonly Result<string>[]>`.

- [ ] **Step 1: Write the failing tests.** Wrap the provider's
      `ensureFoldersAsync` with `vi.spyOn` where a test counts calls.

- `results are aligned to the input, new and existing mixed`:
  - Pre-create `"responses"`, then ensure `["responses/r-1", "responses", "evidence"]`.
  - The result is three `ok` results with values
    `"/sites/dev/Reports/responses/r-1"`, `"/sites/dev/Reports/responses"`
    and `"/sites/dev/Reports/evidence"`, in that order.
- `a failed parent fails its children and spares unrelated paths`:
  - Call `failFolderOn("responses", { status: 403, message: "Access denied." })`,
    then ensure `["responses/r-1", "responses/r-2", "evidence"]`.
  - `[0]` and `[1]` are `!ok`, with `errors[0].code === "parentFailed"` and
    `(errors[0].cause as IError).target === "responses"`.
  - `[2].ok` is true.
- `duplicates, including after normalization, hit the provider once per distinct path`:
  - Ensure `["a/b", "/a/b/", "a\\b"]`.
  - The spy saw exactly one call, with `["a/b"]`.
  - All three results equal `{ ok: true, value: "/sites/dev/Reports/a/b" }`.
- `invalid paths are per-path invalidPath failures, the rest still run`:
  - Ensure `["../x", "", "ok"]`.
  - `[0].errors[0]` matches `{ code: "invalidPath", target: "../x" }`.
  - `[1].errors[0]` matches `{ code: "invalidPath", target: "" }`.
  - `[2].ok` is true, and the spy was called with `["ok"]` only.
- `all-invalid input does not call the provider`: ensure `["", "/"]`. Both are
  `invalidPath`, and the spy was not called.
- `empty input returns [] without calling the provider`.
- `a path the provider omits is noResult`:
  - Stub the spy to resolve `new Map()`, then ensure `["a"]`.
  - `[0].errors[0]` matches `{ code: "noResult", target: "a" }`.
- `rejects when the provider cannot attempt any path` (Review Focus 5):
  - Stub the spy to reject with `new Error("list not found")`.
  - Expect a rejection with `"list not found"`.
- `throws on a store without a file system`: mirror the existing
  `ensureFolderAsync` capability test in this file, for the multi-path method.
- `ensureFolderAsync throws OperationFailedException on a provider failure`:
  - Call `failFolderOn("x", …)`.
  - `ensureFolderAsync("x")` rejects with an `OperationFailedException` whose
    `errors[0].code` is `"requestFailed"`.
  - The existing root and `..` tests still expect `InvalidOperationException`.

- [ ] **Step 2: Run the tests and watch them fail.**
  - Run: `npm -w @speel/core exec -- vitest run test/unit/DbSet.folderOps.test.ts`
  - Expected: FAIL, because `ensureFoldersAsync` is not a function on `DbSet`.

- [ ] **Step 3: Implement it.**
  - **Order of work:**
    1. Run `assertNotDisposed`, then `requireFileSystem(provider, "ensureFoldersAsync()")`.
    2. Normalize each input. A normalize throw or a `""` result becomes
       `Result.fail({ code: "invalidPath", message, target: input })`.
    3. Collect the distinct normalized paths. Call the provider only when
       there is at least one.
    4. Map each input to its invalid result,
       `map.get(normalized) ?? Result.fail({ code: "noResult", … })`.
  - **`ensureFolderAsync`** keeps today's up-front normalize/root check, which
    throws `InvalidOperationException`. It then returns
    `Result.unwrap((await this.ensureFoldersAsync([folderPath]))[0])`.
  - **TSDoc** on `ensureFoldersAsync` covers:
    - the alignment to the input,
    - the four codes,
    - which throws are whole-call,
    - that there is no rollback on partial failure.

- [ ] **Step 4: Run the tests and watch them pass.**
  - Run: `npm -w @speel/core test`
  - Expected: PASS, and the type check is clean.

- [ ] **Step 5: Commit.**
      `git commit -m "feat(core): DbSet.ensureFoldersAsync — one Result per path, aligned to input (#118)"`

---

### Task 4: pnpjs, batched by depth

**Files:**

- Create: `packages/speel-pnpjs/src/batchLimits.ts`. It exports
  `BATCH_REQUEST_LIMIT = 100`, moved from `SharePointProvider.ts:103` with its
  comment. `SharePointProvider.ts` imports it from here.
- Create: `packages/speel-pnpjs/src/httpError.ts`. It exports
  `httpErrorFacts(err: unknown): { status?: number; message: string; body: unknown }`.
  This is the extraction from `SharePointProvider.toFailure`
  (`SharePointProvider.ts:1204-1214`):
  - `status`: from `e.status`.
  - `body`: `e.data ?? e.message ?? err`.
  - `message`: `e.message ?? String(err)`.

  Rewrite `toFailure` to call it, with `status ?? 0`, so its behavior is
  unchanged.

- Modify: `packages/speel-pnpjs/src/SharePointFileSystem.ts:24-94`. Rewrite
  `ensureFoldersAsync` and keep `isFolderExistsError`.
- Test: `packages/speel-pnpjs/test/SharePointProvider.folder.test.ts`, with a
  new `describe("ensureFoldersAsync batching")` and a new fake.

**Interfaces:**

- Consumes: `Result`, `IError` and `FolderErrorCode` from `@speel/core`, plus
  the Task 2 contract.
- Produces: the same contract. There is no new public surface.

- [ ] **Step 1: Write the failing tests against a batch-recording fake.**

Add `fakeBatchSp(opts: { existing?: string[]; failing?: Record<string, { status: number; message: string }>; executeRejects?: Error; caseInsensitive?: boolean })`
to the test file.

- `web.lists.getByTitle()` returns `{ rootFolder: { select: () => async () => ({ ServerRelativeUrl: "/sites/dev/Docs" }) } }`.
- `batched({ maxRequests })` records `maxRequests`, opens a new batch record
  `{ calls: [] }`, and returns `[scoped, execute]`.
- `scoped.web.getFolderByServerRelativePath(parentUrl)` returns
  `{ addSubFolderUsingPath(leaf) }`. That call **synchronously** pushes
  `{ parentUrl, leaf }` onto the current batch and returns a promise that
  settles only when `execute()` runs:
  - It rejects with `{ status: 500, message: "… already exists." }` when the
    path is in `existing` or was already created (case-insensitive if the
    option is set).
  - It rejects with `failing[path]` when the path is listed there.
  - Otherwise it resolves and records the path as created.
- `execute()` settles the queue. With `executeRejects` set, it rejects with
  that error and leaves the queued promises **pending forever**, which is what
  PnPjs 4.20 really does. If the implementation awaits them, the test times out.
- Expose `batches: { parentUrl: string; leaf: string }[][]`, `created: string[]`
  and `maxRequestsSeen: number[]`.

Tests:

- `N root-level paths cost one batch`:
  - Ensure 25 distinct root paths.
  - `batches.length === 1` and `batches[0].length === 25`.
  - Every parentUrl is `"/sites/dev/Docs"`.
  - `maxRequestsSeen` is `[100]`.
  - All 25 results are `ok`.
- `one batch per depth, shallowest first`:
  - Ensure `["a/b/c", "d/e"]`.
  - The batches' leaves are `[["a","d"], ["b","e"], ["c"]]`.
  - Depth 2's parentUrls are `"/sites/dev/Docs/a"` and `"/sites/dev/Docs/d"`.
- `a depth wider than 100 splits into sequential batches`: 101 root paths give
  batch sizes `[100, 1]`.
- `already-exists is success and children are still created`:
  - `existing: ["a"]`, ensure `["a/b"]`.
  - Two batches, and the result is `ok` with `"/sites/dev/Docs/a/b"`.
  - `created` is `["a/b"]`.
- `a failed parent's children are never sent`:
  - `failing: { a: { status: 403, message: "Access denied." } }`, ensure
    `["a/b", "a/c", "z"]`.
  - Only one batch, with leaves `["a", "z"]`.
  - `get("a/b")` and `get("a/c")` are `parentFailed`, with
    `cause.code === "requestFailed"` and `cause.target === "a"`.
  - `get("z").ok` is true.
- `requestFailed carries the status and server message`: from the previous
  setup, ensure `["a"]`. The error matches
  `{ code: "requestFailed", status: 403, message: "Access denied.", target: "a" }`.
- `a rejected execute fails every node in that chunk`: `executeRejects: new Error("network down")`
  makes every result `requestFailed` with message `"network down"` and
  `status` undefined. The promise resolves; it does not reject.
- `a path that is another path's prefix is created once` (Review Focus 3):
  ensure `["a", "a/b"]`. `created` is `["a","a/b"]` and both are `ok`.
- `case-only duplicates both succeed` (Review Focus 2):
  - `caseInsensitive: true`, ensure `["Responses/a", "responses/b"]`.
  - Both are `ok`.
  - The values are `"/sites/dev/Docs/Responses/a"` and
    `"/sites/dev/Docs/responses/b"`.
  - `created` contains a single depth-1 entry plus both children.
- `passes raw names to the PnPjs path APIs` (Review Focus 1):
  - Ensure `["it's #1/a b%"]`.
  - The recorded leaves are `"it's #1"` and `"a b%"`.
  - The depth-2 parentUrl is `"/sites/dev/Docs/it's #1"`, not encoded.
- Keep the root-URL-unresolvable test: it still rejects.
- Delete the Task 2 tests that relied on the old `rootFolder` chaining fake
  (`makeFolder`), or migrate them to `fakeBatchSp`. The `addValidateUpdateItemUsingPath`
  tests further down the file keep `fakeSp`.

- [ ] **Step 2: Run the tests and watch them fail.**
  - Run: `npm -w @speel/pnpjs exec -- vitest run test/SharePointProvider.folder.test.ts`
  - Expected: FAIL, because the current implementation chains from
    `list.rootFolder` and never calls `batched`.

- [ ] **Step 3: Implement the depth-batched algorithm.** The approach is fixed
      by spec §6. These are the parts the tests don't determine:

```ts
// nodes: Map<prefix, { depth, parent: string | null, leaf }>, built from the
// distinct paths' non-empty segments.
// outcome: Map<prefix, IError | null>   (null = exists/created)
for (let d = 1; d <= maxDepth; d++) {
  const ready = nodesAtDepth(d).filter(
    (n) => n.parent === null || outcome.get(n.parent) === null,
  );
  for (let i = 0; i < ready.length; i += BATCH_REQUEST_LIMIT) {
    const chunk = ready.slice(i, i + BATCH_REQUEST_LIMIT);
    const [sp2, execute] = this.host.sp.batched({
      maxRequests: BATCH_REQUEST_LIMIT,
    });
    // enrol synchronously — no await between batched() and the last call
    const settled = chunk.map((n) =>
      sp2.web
        .getFolderByServerRelativePath(
          n.parent ? `${rootUrl}/${n.parent}` : rootUrl,
        )
        .addSubFolderUsingPath(n.leaf)
        .then(
          () => null,
          (err: unknown) =>
            isFolderExistsError(err) ? null : toRequestFailed(n.prefix, err),
        ),
    );
    // PnPjs 4.20 (batching.js ~160-170): if the batch POST fails, the queued
    // promises are NEVER settled — awaiting them would hang. Branch on execute().
    const batchErr = await execute().then(
      () => null,
      (err: unknown) => err ?? new Error("batch failed"),
    );
    if (batchErr !== null)
      chunk.forEach((n) =>
        outcome.set(n.prefix, toRequestFailed(n.prefix, batchErr)),
      );
    else
      (await Promise.all(settled)).forEach((e, k) =>
        outcome.set(chunk[k].prefix, e),
      );
  }
}
// per distinct path: its shallowest prefix with a non-null outcome decides it —
// own node → that requestFailed (target = path); proper ancestor → parentFailed (cause = ancestor's IError);
// a prefix never attempted (ancestor failed) is skipped by the "shallowest" rule.
```

- `toRequestFailed(target, err)` builds `{ code: "requestFailed", message, status, cause: err, target }`
  from `httpErrorFacts`.
- The `settled` promises each carry their own rejection handler (`.then(ok, err)`),
  so they can never raise an unhandled rejection, even when they are
  abandoned after a batch failure.
- Update the `isFolderExistsError` comment. It is now matched per batch
  sub-response, and live verification is still pending (Task 6).

- [ ] **Step 4: Run the full pnpjs suite and watch it pass.**
  - Run: `npm -w @speel/pnpjs test`
  - Expected: PASS, including `SharePointProvider.batch*.test.ts` (unchanged
    after the `toFailure` refactor).

- [ ] **Step 5: Commit.**
      `git commit -m "feat(pnpjs): ensureFoldersAsync creates one \$batch per depth (#118)"`

---

### Task 5: Conformance case, changeset, and full verify

**Files:**

- Modify: `packages/speel-core/src/testing/conformance/providerConformance.ts`.
  Add a case `ensureFoldersAsync: new and existing paths in one call are both ok`:
  ensure `[h.folderPath]`, then `[h.folderPath, `${h.folderPath}/conf-${token()}`]`,
  and assert both are `ok`. The live run (Task 6) executes it against
  SharePoint through `providerConformance.spec.ts`.
- Create: `.changeset/ensure-folders-batch.md`. It is `minor` for
  `@speel/core` and `@speel/pnpjs`.
  - The body says `IFileSystem.ensureFoldersAsync` now returns
    `ReadonlyMap<string, Result<string>>` (a breaking change for custom
    providers).
  - It introduces `Result<T>`/`IError`/`OperationFailedException` and
    `DbSet.ensureFoldersAsync`.
  - It notes that a server failure in `ensureFolderAsync` now throws
    `OperationFailedException`.

- [ ] **Step 1: Add the conformance case, and run the fake-backed conformance
      test.**
  - Run: `npm -w @speel/core exec -- vitest run test/unit/conformance/FakeStorageProvider.conformance.test.ts`
  - Expected: PASS.
- [ ] **Step 2: Write the changeset.**
- [ ] **Step 3: Run the full gate.**
  - Run: `npm run verify && npm run format:check`
  - Expected: both exit 0. That includes `check:node-esm`, the registry and the
    spfx-sample `build:check` (memory: the sample must build).
- [ ] **Step 4: Commit.**
      `git commit -m "test(core): conformance for mixed new/existing folders; changeset (#118)"`

---

### Task 6: Live tenant check (asks before running)

**Files:**

- Create: `samples/spfx-sample/tests/ensureFolders.spec.ts`, modeled on
  `folderPlacement.spec.ts` (the `authPage` fixture and `window.pd`).

**Interfaces:**

- Consumes: `pd.ctx.projects.ensureFoldersAsync` and `deleteFolderAsync`.

- [ ] **Step 1: Write the spec.**
  - Inside `authPage.evaluate`:
    - Set `root = "SpeelE2E/ensure-" + Date.now()`.
    - Pre-create `${root}/existing` with `ensureFolderAsync`.
    - Then call `ensureFoldersAsync` with:
      `[`${root}/existing`, `${root}/n1`, `${root}/n2`, `${root}/n3`, `${root}/existing/child`, `${root}/bad*name`, `${root}/bad*name/child`]`.
    - For every `ok` result, fetch
      `_api/web/getFolderByServerRelativePath(decodedurl='<url>')/ListItemAllFields?$select=FSObjType,FileRef`
      and collect `FSObjType`.
    - Recycle `root` in a `finally`.
    - Return the results with `cause` stripped, plus the `FSObjType` values.
  - Assertions:
    - Indices 0-4 are `ok`, and each value ends with its input path.
    - `[5]` is `requestFailed` with a numeric `status`.
    - `[6]` is `parentFailed`.
    - Every collected `FSObjType` is `1`.
  - Also `console.log` `[5]`'s message, and the raw message of an
    "already exists" rejection if one surfaces. This is evidence for Review
    Focus 4.
- [ ] **Step 2: Ask the user before starting the serve or Playwright**
      (memory: ask before live server). Do not proceed without a yes.
- [ ] **Step 3: Run it.**
  - Start the serve with `npm run dev` in `samples/spfx-sample`, outside the
    sandbox. Confirm `:4321` serves this worktree (memory: stale serve).
  - Then run `npx playwright test tests/ensureFolders.spec.ts tests/providerConformance.spec.ts`
    with `PW_E2E` set.
  - Expected: both pass.
- [ ] **Step 4: Tighten `isFolderExistsError` if the evidence calls for it.**
  - If the logged "already exists" text differs from the matcher, update the
    matcher and its fake test.
  - If it distinguishes folders from files, narrow it to the folder wording.
  - Either way, replace the "best-effort, unconfirmed" comment with
    "verified live 2026-11-<dd>".
- [ ] **Step 5: Commit.**
      `git commit -m "test(sample): live check for batched ensureFoldersAsync; confirm exists-error match (#118)"`

---

### Task 7: Document step, follow-up issue

**Files:**

- Modify: `packages/speel-core/docs/files.md`.
  - **Capabilities, "Direct file and folder operations":** say "Seven"
    methods, add `ensureFoldersAsync` to the code block, and add a paragraph
    covering the per-path `Result`s, input alignment, the four codes, and
    round trips scaling with depth.
  - **Boundaries & gotchas:** no rollback on partial failure (re-run instead),
    and `ensureFolderAsync` now throws `OperationFailedException` on a server
    failure.
  - Keep the page within 250 lines.
- Modify: `packages/speel-core/README.md`, the `## Conventions` section. Add a
  short **Results** entry: `Result<T>`, `IError`, branching on `ok`, matching
  on `code` rather than `message`, and `Result.unwrap`.
  - Re-verify every name against `packages/speel-core/src/index.ts`, reading
    the file.

- [ ] **Step 1: Write both doc changes, then run `npm run format:check`.**
      Expected: exit 0.
- [ ] **Step 2: Commit.**
      `git commit -m "docs(core): ensureFoldersAsync and the Result convention (#118)"`
- [ ] **Step 3: Open the follow-up issue.** Run
      `gh issue create --title "Standardize result types on Result<T> / IError" --body-file <scratch file>`
      with `allowed_domains: ["api.github.com"]`. The body:
  - references #118 and `packages/speel-core/src/Result.ts`;
  - lists each existing type with its file: core `IBatchOperationResult`,
    `IReadOperationResult`, `IFileUploadResult`, `IRenameResult`; identity
    `IdentityBatchResult`, `IdentitySaveResult`, `ApplyResult`; migrations
    `MigrateResult`, `SchemaOpResult`, `ListResult` (migrations-cli); react
    `MigrationResult`, `SurfaceResult`;
  - classifies each as either a **success/failure result**, to be replaced by
    `Result<T>`, or a **value bag**, which stays as the `T`. Read each type to
    classify it;
  - contains no consumer names.

  Expected: an issue URL. Report it to the user.
