# Release Runs Once Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix #93 — a release run on `main` ends green: `npm run release` runs once per push, and a re-run tolerates npm's lagging registry.

**Architecture:** `release.yml` drops its standalone `npm run release` step, so the script runs only as `changesets/action`'s `publish-script` (when no changesets are pending). `scripts/release.mjs` captures `npm publish`'s stderr and classifies the result through a new pure helper in `scripts/release-plan.mjs`: npm's "cannot publish over the previously published versions" E403 counts as already published; any other failure still aborts.

**Tech Stack:** GitHub Actions, `changesets/action` v2, Node ESM scripts, `node:test`.

**Spec:** GitHub issue #93 (cause, impact, proposed fixes). Decision taken with the owner: the issue's "drop one of the two calls" alternative plus its E403 fallback; the "existing release ⇒ all published" shortcut is not needed once the script runs once. Accepted trade-off: a Version PR merged while stale (a changeset landed and the action has not refreshed the PR) no longer publishes the stale version — the next release ships the newer one, as upstream Changesets does.

## Global Constraints

- `.github/workflows/release.yml` keeps its filename (npm trusted publishing is bound to it).
- No changes under `packages/`, so no changeset is required (the check only demands one when `packages/` changes).
- Commits end with the session's single attribution line; nothing names a consumer app/org.
- `npm run test:scripts` (`node --test scripts/*.test.mjs`) and `npm run format:check` must pass.

## Review Focus

- An E403 that is _not_ "cannot publish over" (e.g. trusted-publishing/OIDC permission denied) must still abort the run — tested in Task 2.
- A non-403 publish failure (network, E404, 5xx) must still abort — tested in Task 2.
- Capturing stderr must not hide npm's error output from the CI log — Task 2 Step 3 echoes it; checked by reading the code (no harness drives `release.mjs`).
- A push that only updates the Version PR must not call `npm run release` at all — tested in Task 1.
- A lagged re-run that skips an already-published package must still go on to create the GitHub release — follows from the loop continuing; checked in Task 2 Step 3.

---

### Task 1: `release.yml` calls the release script once

**Files:**

- Modify: `.github/workflows/release.yml` (header comment; delete the `run: npm run release` step and its comment)
- Test: `scripts/workflows.test.mjs` (replace the existing test)

**Interfaces:** none.

- [ ] **Step 1: Replace the test**

```js
test("release.yml runs npm run release only as changesets/action's publish-script", () => {
  assert.equal(release.match(/npm run release/g)?.length, 1, "one call site");
  assert.match(release, /^\s+publish-script: npm run release$/m);
  assert.doesNotMatch(release, /run: npm run release/);
});
```

Count only non-comment lines if the header comment mentions `npm run release` (strip `#…` lines before matching), so the comment can still name the script.

- [ ] **Step 2: Run it — FAIL** (`node --test scripts/workflows.test.mjs`: two call sites).

- [ ] **Step 3: Edit `release.yml`** — delete the step and its two-line comment; rewrite the header: on every push to main, pending changesets → create/update the Version PR; none pending → the action runs `npm run release` (gates, publish via trusted publishing, one tag + release; idempotent, so re-running the failed run resumes it); only empty changesets → nothing. Keep the "npm trusts THIS FILENAME" line.

- [ ] **Step 4: Run it — PASS.**

- [ ] **Step 5: Commit** — `ci(release): run npm run release once, as the action's publish script (#93)`

### Task 2: an "already published" E403 is not a failure

**Files:**

- Modify: `scripts/release-plan.mjs` (new export), `scripts/release.mjs` (publish loop)
- Test: `scripts/release-plan.test.mjs`

**Interfaces:**

- Produces: `publishOutcome({ status, stderr }): "published" | "already-published"` in `scripts/release-plan.mjs` — exit 0 → `"published"`; stderr matching `/cannot publish over the previously published version/i` → `"already-published"`; anything else throws `npm publish failed (exit <status>): <stderr trimmed>`. Same doc-comment style as `npmPublished`.

- [ ] **Step 1: Write the failing test**

```js
test("publishOutcome: exit 0 → published; 'cannot publish over' E403 → already-published; anything else throws", () => {
  assert.equal(publishOutcome({ status: 0, stderr: "" }), "published");
  assert.equal(
    publishOutcome({
      status: 1,
      stderr:
        "npm error code E403\nnpm error 403 403 Forbidden - PUT https://registry.npmjs.org/@speel%2fcore - You cannot publish over the previously published versions: 0.1.0-beta.5.",
    }),
    "already-published",
  );
  assert.throws(
    () =>
      publishOutcome({
        status: 1,
        stderr:
          "npm error code E403\nnpm error 403 Forbidden - not authorized to publish",
      }),
    /npm publish failed \(exit 1\)/,
  );
  assert.throws(
    () => publishOutcome({ status: 1, stderr: "npm error code ECONNRESET" }),
    /ECONNRESET/,
  );
});
```

- [ ] **Step 2: Run it — FAIL** (`publishOutcome` is not exported).

- [ ] **Step 3: Implement** `publishOutcome` in `release-plan.mjs`; in `release.mjs` publish each package with `spawnSync("npm", [...same args], { stdio: ["inherit", "inherit", "pipe"], encoding: "utf8" })`, write `r.stderr` to `process.stderr` (the log keeps npm's output), log the `$ npm publish …` line as `run` does, and on `"already-published"` log `<name>@<version> is already on npm — skipping` and continue. Gates and release creation are unchanged.

- [ ] **Step 4: Run `npm run test:scripts` — PASS; `node scripts/release.mjs --dry-run` still prints a plan** (needs network to npm/GitHub; skip if unreachable and say so).

- [ ] **Step 5: Commit** — `fix(release): treat npm's "cannot publish over" E403 as already published (#93)`

### Task 3: verify and open the PR

- [ ] `npm run format:check` and `npm run test:scripts` pass.
- [ ] With the owner's go-ahead, push the branch and open a PR titled `fix(release): run the release script once; tolerate npm registry lag (#93)`, body = the change summary + `Closes #93` + the accepted stale-Version-PR trade-off. Confirm `verify` and `changeset` go green.
