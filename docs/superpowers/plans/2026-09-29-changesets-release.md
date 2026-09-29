# Changesets Release Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual bump/CHANGELOG/tag-push release with Changesets: PRs carry changeset files, a GitHub App-authored "Version Packages" PR accumulates them, and merging it publishes all six `@speel/*` packages with one `vX.Y.Z` tag and one GitHub release.

**Architecture:** `release.yml` (push to `main`) runs `changesets/action` with a GitHub App token: pending changesets → it maintains the Version PR via `npm run version-packages`; none pending → it runs `npm run release` (`scripts/release.mjs`), which plans from registry/GitHub state and publishes idempotently. `ci.yml` (PRs only) adds a `changeset` job running `scripts/check-changeset.mjs`. Both scripts are thin I/O wrappers over pure, node:test-covered modules.

**Tech Stack:** `@changesets/cli` 3.0.3, `changesets/action` v2.1.2, `actions/create-github-app-token` v3.2.0, Node 22 built-ins (`node:test`, `child_process`), `gh` CLI (preinstalled on runners), npm trusted publishing (OIDC).

**Spec:** `docs/superpowers/specs/2026-09-29-changesets-release-design.md`

**Worktree:** `/home/peter/source/repos/backlundpf/speel/.claude/worktrees/changesets-release`, branch `feat/changesets-release`. Run every command from there (`pwd` first). `npm install` needs `--cache "$TMPDIR/npm-cache"` inside the sandbox.

## Global Constraints

- The publishing workflow file stays `.github/workflows/release.yml` (npm trusted publishing is bound to that filename).
- Action pins (full SHAs, verified 2026-09-29):
  - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`
  - `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`
  - `actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0`
  - `changesets/action@ae32849d5ba541f9ae29e40e22a623bc13562f51 # v2.1.2`
- `@changesets/cli` pinned exactly `3.0.3` (changesets/action v2 rejects CLI v2).
- Secrets: `RELEASE_APP_CLIENT_ID`, `RELEASE_APP_PRIVATE_KEY` (create-github-app-token v3 input `client-id`; `app-id` is deprecated).
- Never set a `GITHUB_TOKEN` env on the changesets/action step — the action throws if it differs from `github-token`. The action itself exports the App token as `GITHUB_TOKEN` to the publish script, which `gh` reads.
- Publish order: `@speel/core`, `@speel/identity`, `@speel/migrations`, `@speel/pnpjs`, `@speel/react`, `@speel/migrations-cli`.
- `scripts/*.mjs` use Node built-ins only (the `changeset` CI job runs without `npm ci`).
- Release job: Node from `.node-version`; `npm install -g npm@11` (trusted publishing needs ≥ 11.5.1).
- Workflow token permissions: `release.yml` `contents: read` + `id-token: write`; `ci.yml` `contents: read`.
- Public repo: no consumer app/org/tenant/account names anywhere (CLAUDE.md).

## Review Focus

- A changeset naming a package that doesn't exist (typo, `@speel/cor`) → fails at PR time, not at `changeset version` on main. (Task 2 test)
- A package-touching PR that only edits `.changeset/README.md` → not counted as a changeset. (Task 2 test)
- Changeset frontmatter written with single quotes, unquoted names, or CRLF line endings → parsed like the CLI's own output. (Task 2 test)
- Re-run after all six published but the GitHub release step failed → no gates, no publish, release created against the existing tag (`--verify-tag`). (Task 3 test)
- A package whose CHANGELOG is missing or has no section for the version → release notes skip it, never crash. (Task 3 test)

---

### Task 1: Changesets configuration and package manifests

**Files:**

- Modify: `package.json` (devDependency + scripts)
- Modify: `packages/*/package.json` (all six: `files` gains `CHANGELOG.md`; `publishConfig.tag` removed)
- Create: `.changeset/config.json`, `.changeset/pre.json` (via CLI), `.changeset/README.md`, `.changeset/changesets-release-automation.md`
- Modify: `package-lock.json`

**Interfaces:**

- Produces: root scripts `changeset` and `version-packages`; `.changeset/pre.json` with `{"mode":"pre","tag":"beta",...}` read by Tasks 2–4.

- [ ] **Step 1: Install the CLI**

```bash
pwd   # …/.claude/worktrees/changesets-release
npm install -D --save-exact --cache "$TMPDIR/npm-cache" @changesets/cli@3.0.3
```

- [ ] **Step 2: Write `.changeset/config.json`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@4.0.1/schema.json",
  "baseBranch": "main",
  "access": "public",
  "fixed": [["@speel/*"]],
  "linked": [],
  "ignore": [],
  "updateInternalDependencies": "patch",
  "changelog": "@changesets/cli/changelog",
  "commit": false
}
```

- [ ] **Step 3: Enter pre mode**

Run: `npx changeset pre enter beta`
Expected: `Entered pre mode with tag beta!` and `.changeset/pre.json` exists with `"mode": "pre"`, `"tag": "beta"`.

- [ ] **Step 4: Root scripts**

Add to root `package.json` `scripts` (keep existing entries):

```json
"changeset": "changeset",
"version-packages": "changeset version && npm install --package-lock-only --ignore-scripts"
```

- [ ] **Step 5: Package manifests**

```bash
node -e '
const fs = require("fs");
for (const d of fs.readdirSync("packages")) {
  const f = `packages/${d}/package.json`;
  const p = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!p.files.includes("CHANGELOG.md")) p.files.push("CHANGELOG.md");
  delete p.publishConfig.tag;
  fs.writeFileSync(f, JSON.stringify(p, null, 2) + "\n");
}'
node -p 'require("./packages/speel-core/package.json").publishConfig'
```

Expected: `{ access: 'public' }`.

- [ ] **Step 6: `.changeset/README.md`**

```markdown
# Changesets

Every PR that touches `packages/` adds a changeset — CI's `changeset` check enforces it.

    npx changeset          # pick any package, pick the bump, write one line for the CHANGELOG
    npx changeset --empty  # tests, internal refactors: records "no release" explicitly

All six `@speel/*` packages are one fixed group: any changeset bumps all of them to the
same version, so which package you pick only decides whose CHANGELOG carries the line.

**Under 0.x:** `patch` for fixes, `minor` for features and breaking changes. `major` is
rejected by CI until 1.0 (it would publish 1.0.0).

Releasing: merge the bot's "Version Packages" PR. Nothing else.
```

- [ ] **Step 7: This PR's own changeset**

`.changeset/changesets-release-automation.md`:

```markdown
---
---

Release automation moves to Changesets; no package behaviour changes.
```

- [ ] **Step 8: Verify versioning in a throwaway clone**

```bash
git add -A && git commit -q -m "wip: changesets config"   # squashed away at merge
X="$TMPDIR/cs-verify"; rm -rf "$X"; git clone -q "$PWD" "$X"
cd "$X" && npm ci --cache "$TMPDIR/npm-cache" >/dev/null 2>&1
printf -- '---\n"@speel/core": patch\n---\n\nProbe.\n' > .changeset/probe.md
npm run version-packages >/dev/null 2>&1
node -e 'for (const d of require("fs").readdirSync("packages")) console.log(require("./packages/"+d+"/package.json").version)' | sort -u
npm ci --cache "$TMPDIR/npm-cache" >/dev/null 2>&1 && readlink node_modules/@speel/core
cd - && rm -rf "$X"
```

Expected: exactly one line `0.1.0-beta.2`; `npm ci` succeeds; readlink prints `../../packages/speel-core`.

- [ ] **Step 9: Format and amend**

```bash
npx prettier --write --log-level warn package.json packages/*/package.json .changeset
npm run format:check
git add -A && git commit -q --amend -m "build: changesets config, pre mode on beta, package manifests" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: PR changeset check

**Files:**

- Create: `scripts/changeset-rules.mjs` (pure rules)
- Create: `scripts/changeset-rules.test.mjs`
- Create: `scripts/check-changeset.mjs` (git/env wrapper)
- Modify: `package.json` (scripts `check:changeset`, `test:scripts`; `verify` runs `test:scripts` first)

**Interfaces:**

- Produces:
  - `parseChangeset(content: string): { releases: { name: string, type: "patch"|"minor"|"major" }[] }` — throws `Error` on malformed frontmatter.
  - `checkChangesets({ changedFiles: string[], addedChangesets: { path: string, content: string }[], headRef: string, author: string, preMode: boolean, packageNames: string[] }): { ok: boolean, errors: string[], notes: string[] }`
  - `isChangesetPath(path: string): boolean`
  - CLI `node scripts/check-changeset.mjs` — exit 0 pass, 1 rule failure, 2 cannot compute diff. Env: `GITHUB_BASE_REF` (default `main`), `PR_HEAD_REF`, `PR_AUTHOR`.

- [ ] **Step 1: Write the failing tests** — `scripts/changeset-rules.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseChangeset,
  checkChangesets,
  isChangesetPath,
} from "./changeset-rules.mjs";

const NAMES = [
  "@speel/core",
  "@speel/identity",
  "@speel/migrations",
  "@speel/migrations-cli",
  "@speel/pnpjs",
  "@speel/react",
];
const base = {
  changedFiles: [],
  addedChangesets: [],
  headRef: "feat/x",
  author: "someone",
  preMode: true,
  packageNames: NAMES,
};
const cs = (content, path = ".changeset/a.md") => ({ path, content });

test("parses the CLI's own output", () => {
  assert.deepEqual(parseChangeset('---\n"@speel/core": patch\n---\n\nFix.\n'), {
    releases: [{ name: "@speel/core", type: "patch" }],
  });
});

test("parses single quotes, unquoted names and CRLF", () => {
  const r = parseChangeset(
    "---\r\n'@speel/core': minor\r\n@speel/react: patch\r\n---\r\n\r\nX\r\n",
  );
  assert.deepEqual(r.releases, [
    { name: "@speel/core", type: "minor" },
    { name: "@speel/react", type: "patch" },
  ]);
});

test("parses an empty changeset", () => {
  assert.deepEqual(parseChangeset("---\n---\n\nNothing.\n"), { releases: [] });
});

test("rejects malformed frontmatter", () => {
  assert.throws(() => parseChangeset("no frontmatter"), /frontmatter/);
  assert.throws(() => parseChangeset("---\n@speel/core patch\n---\n"), /line/);
  assert.throws(() => parseChangeset("---\n@speel/core: huge\n---\n"), /line/);
});

test("isChangesetPath: only new .md files under .changeset, never the README", () => {
  assert.equal(isChangesetPath(".changeset/brave-owls.md"), true);
  assert.equal(isChangesetPath(".changeset/README.md"), false);
  assert.equal(isChangesetPath(".changeset/config.json"), false);
  assert.equal(isChangesetPath("docs/x.md"), false);
});

test("package change without a changeset fails with the fix in the message", () => {
  const r = checkChangesets({
    ...base,
    changedFiles: ["packages/speel-core/src/a.ts"],
  });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /npx changeset/);
  assert.match(r.errors[0], /--empty/);
});

test("package change with an empty changeset passes", () => {
  const r = checkChangesets({
    ...base,
    changedFiles: ["packages/speel-core/test/a.test.ts", ".changeset/a.md"],
    addedChangesets: [cs("---\n---\n\nTests only.\n")],
  });
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test("a PR touching only non-package paths needs nothing", () => {
  const r = checkChangesets({
    ...base,
    changedFiles: [
      ".github/workflows/ci.yml",
      "docs/x.md",
      "samples/spfx-sample/a.ts",
    ],
  });
  assert.equal(r.ok, true);
});

test("editing .changeset/README.md does not count as a changeset", () => {
  const r = checkChangesets({
    ...base,
    changedFiles: ["packages/speel-core/src/a.ts", ".changeset/README.md"],
    addedChangesets: [],
  });
  assert.equal(r.ok, false);
});

test("major is rejected in pre mode, allowed after", () => {
  const major = {
    ...base,
    changedFiles: ["packages/speel-core/src/a.ts"],
    addedChangesets: [cs('---\n"@speel/core": major\n---\n\nX\n')],
  };
  const pre = checkChangesets(major);
  assert.equal(pre.ok, false);
  assert.match(pre.errors[0], /minor/);
  assert.equal(checkChangesets({ ...major, preMode: false }).ok, true);
});

test("an unknown package name fails at PR time", () => {
  const r = checkChangesets({
    ...base,
    changedFiles: ["packages/speel-core/src/a.ts"],
    addedChangesets: [cs('---\n"@speel/cor": patch\n---\n\nX\n')],
  });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /@speel\/cor/);
});

test("a malformed changeset fails and names the file", () => {
  const r = checkChangesets({
    ...base,
    changedFiles: ["packages/speel-core/src/a.ts"],
    addedChangesets: [cs("oops", ".changeset/bad.md")],
  });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /\.changeset\/bad\.md/);
});

test("Dependabot and the Version Packages PR are exempt", () => {
  const touching = {
    ...base,
    changedFiles: ["packages/speel-core/package.json"],
  };
  assert.equal(
    checkChangesets({ ...touching, author: "dependabot[bot]" }).ok,
    true,
  );
  assert.equal(
    checkChangesets({ ...touching, headRef: "changeset-release/main" }).ok,
    true,
  );
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test scripts/changeset-rules.test.mjs`
Expected: FAIL — `Cannot find module …/changeset-rules.mjs`.

- [ ] **Step 3: Implement `scripts/changeset-rules.mjs`**

```js
// Pure rules behind the PR changeset check. scripts/check-changeset.mjs feeds them
// the PR's diff; keeping the rules I/O-free is what makes them testable.

export const EXEMPT_AUTHORS = ["dependabot[bot]"];
export const EXEMPT_BRANCHES = ["changeset-release/main"];
const BUMP_LINE = /^\s*(["']?)(@?[^"':\s]+)\1\s*:\s*(patch|minor|major)\s*$/;

/** A new pending changeset file: `.changeset/<name>.md`, never the README. */
export function isChangesetPath(path) {
  return (
    /^\.changeset\/[^/]+\.md$/.test(path) && path !== ".changeset/README.md"
  );
}

/** The releases a changeset's frontmatter declares; an `--empty` changeset declares none. */
export function parseChangeset(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---")
    throw new Error("missing frontmatter (first line must be ---)");
  const end = lines.indexOf("---", 1);
  if (end === -1) throw new Error("unterminated frontmatter (no closing ---)");
  const releases = [];
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    const m = BUMP_LINE.exec(line);
    if (!m)
      throw new Error(`unrecognized frontmatter line: ${JSON.stringify(line)}`);
    releases.push({ name: m[2], type: m[3] });
  }
  return { releases };
}

export function checkChangesets({
  changedFiles,
  addedChangesets,
  headRef,
  author,
  preMode,
  packageNames,
}) {
  if (EXEMPT_AUTHORS.includes(author) || EXEMPT_BRANCHES.includes(headRef)) {
    return { ok: true, errors: [], notes: [`exempt (${author || headRef})`] };
  }
  const errors = [];
  const notes = [];
  for (const { path, content } of addedChangesets) {
    let releases;
    try {
      ({ releases } = parseChangeset(content));
    } catch (e) {
      errors.push(`${path}: ${e.message}`);
      continue;
    }
    for (const { name, type } of releases) {
      if (!packageNames.includes(name)) {
        errors.push(
          `${path}: unknown package ${name} (known: ${packageNames.join(", ")})`,
        );
      }
      if (preMode && type === "major") {
        errors.push(
          `${path}: "major" for ${name} is not allowed before 1.0 — it would publish 1.0.0. ` +
            `Use "minor" for breaking changes under 0.x.`,
        );
      }
    }
    notes.push(
      `${path}: ${releases.length ? releases.map((r) => `${r.name} ${r.type}`).join(", ") : "empty"}`,
    );
  }
  const touchesPackages = changedFiles.some((f) => f.startsWith("packages/"));
  if (touchesPackages && addedChangesets.length === 0) {
    errors.push(
      "This PR changes packages/ but adds no changeset. Run `npx changeset` " +
        "(or `npx changeset --empty` for changes that should not release) and commit the file.",
    );
  }
  return { ok: errors.length === 0, errors, notes };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test scripts/changeset-rules.test.mjs`
Expected: PASS, 13 tests.

- [ ] **Step 5: Implement `scripts/check-changeset.mjs`**

```js
#!/usr/bin/env node
// PR changeset check: the git/env wrapper around ./changeset-rules.mjs.
// CI: ci.yml's `changeset` job (checkout with fetch-depth: 0). Locally:
// `npm run check:changeset` compares committed HEAD against origin/main.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { checkChangesets, isChangesetPath } from "./changeset-rules.mjs";

const base = `origin/${process.env.GITHUB_BASE_REF || "main"}`;
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const lines = (s) => s.split("\n").filter(Boolean);

try {
  git("merge-base", base, "HEAD");
} catch {
  console.error(
    `check-changeset: no merge base with ${base}. Fetch it first ` +
      "(CI: actions/checkout with fetch-depth: 0; locally: git fetch origin).",
  );
  process.exit(2);
}

const changedFiles = lines(git("diff", "--name-only", `${base}...HEAD`));
const addedChangesets = lines(
  git(
    "diff",
    "--name-only",
    "--diff-filter=A",
    `${base}...HEAD`,
    "--",
    ".changeset",
  ),
)
  .filter(isChangesetPath)
  .map((path) => ({ path, content: readFileSync(path, "utf8") }));
const packageNames = readdirSync("packages").map(
  (d) => JSON.parse(readFileSync(`packages/${d}/package.json`, "utf8")).name,
);
const preMode =
  existsSync(".changeset/pre.json") &&
  JSON.parse(readFileSync(".changeset/pre.json", "utf8")).mode === "pre";

const result = checkChangesets({
  changedFiles,
  addedChangesets,
  headRef: process.env.PR_HEAD_REF ?? "",
  author: process.env.PR_AUTHOR ?? "",
  preMode,
  packageNames,
});
for (const n of result.notes) console.log(n);
for (const e of result.errors) console.error(`✗ ${e}`);
if (result.ok) console.log("✓ changeset check passed");
process.exit(result.ok ? 0 : 1);
```

- [ ] **Step 6: Root scripts**

In root `package.json` `scripts` add:

```json
"check:changeset": "node scripts/check-changeset.mjs",
"test:scripts": "node --test scripts/*.test.mjs"
```

and change `verify` to start with `npm run test:scripts && `:

```json
"verify": "npm run test:scripts && npm run build && npm run check:node-esm && npm run typecheck && npm run test && npm --prefix registry run build:check && npm --prefix samples/spfx-sample run build:check"
```

- [ ] **Step 7: Exercise the CLI on this branch**

```bash
git add -A && git commit -q -m "wip: changeset check"
git fetch -q origin   # needs network: dangerouslyDisableSandbox
npm run check:changeset
```

Expected: exit 0; prints `.changeset/changesets-release-automation.md: empty` and `✓ changeset check passed` (this branch touches `packages/*/package.json` and adds the empty changeset from Task 1).

- [ ] **Step 8: Format and amend**

```bash
npx prettier --write --log-level warn scripts package.json && npm run format:check && npm run test:scripts
git add -A && git commit -q --amend -m "ci: changeset check script with rules and tests" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Release planning (pure)

**Files:**

- Create: `scripts/release-plan.mjs`
- Create: `scripts/release-plan.test.mjs`

**Interfaces:**

- Produces:
  - `PUBLISH_ORDER: string[]` — the six names in dependency order.
  - `distTagFor(version: string, pre: { mode: string, tag: string } | null): string`
  - `planRelease({ packages: { name, version }[], published: Set<string> /* "name@version" */, tagExists: boolean, releaseExists: boolean, pre }): { version, tag, distTag, prerelease: boolean, toPublish: string[], runGates: boolean, createRelease: boolean, tagExists: boolean, nothingToDo: boolean }` — throws on version mismatch, wrong package set, or pre/version disagreement.
  - `releaseNotes(version: string, changelogs: { name: string, text: string }[]): string`

- [ ] **Step 1: Write the failing tests** — `scripts/release-plan.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PUBLISH_ORDER,
  distTagFor,
  planRelease,
  releaseNotes,
} from "./release-plan.mjs";

const V = "0.1.0-beta.2";
const PRE = { mode: "pre", tag: "beta" };
const pkgs = (v = V) => PUBLISH_ORDER.map((name) => ({ name, version: v }));
const all = (v = V) => new Set(PUBLISH_ORDER.map((n) => `${n}@${v}`));
const plan = (o) =>
  planRelease({
    packages: pkgs(),
    published: new Set(),
    tagExists: false,
    releaseExists: false,
    pre: PRE,
    ...o,
  });

test("distTagFor: pre mode → its tag; stable → latest; mismatches throw", () => {
  assert.equal(distTagFor(V, PRE), "beta");
  assert.equal(distTagFor("0.2.0", null), "latest");
  assert.equal(distTagFor("0.2.0", { mode: "exit", tag: "beta" }), "latest");
  assert.throws(() => distTagFor("0.2.0", PRE), /pre mode/);
  assert.throws(() => distTagFor(V, null), /prerelease/);
});

test("fresh release: publish all six in order, gates, then release", () => {
  const p = plan({});
  assert.deepEqual(p.toPublish, PUBLISH_ORDER);
  assert.equal(p.runGates, true);
  assert.equal(p.createRelease, true);
  assert.equal(p.tag, "v0.1.0-beta.2");
  assert.equal(p.distTag, "beta");
  assert.equal(p.prerelease, true);
  assert.equal(p.nothingToDo, false);
});

test("nothing to do when all six are published and the release exists", () => {
  const p = plan({ published: all(), tagExists: true, releaseExists: true });
  assert.equal(p.nothingToDo, true);
  assert.equal(p.runGates, false);
  assert.deepEqual(p.toPublish, []);
});

test("partial re-run publishes only the rest, still in order", () => {
  const p = plan({
    published: new Set([`@speel/core@${V}`, `@speel/identity@${V}`]),
  });
  assert.deepEqual(p.toPublish, [
    "@speel/migrations",
    "@speel/pnpjs",
    "@speel/react",
    "@speel/migrations-cli",
  ]);
  assert.equal(p.runGates, true);
});

test("all published but the release failed: no gates, release against the existing tag", () => {
  const p = plan({ published: all(), tagExists: true, releaseExists: false });
  assert.equal(p.runGates, false);
  assert.deepEqual(p.toPublish, []);
  assert.equal(p.createRelease, true);
  assert.equal(p.tagExists, true);
  assert.equal(p.nothingToDo, false);
});

test("lockstep broken → throws naming the versions", () => {
  const packages = pkgs();
  packages[4] = { name: "@speel/react", version: "0.1.0-beta.1" };
  assert.throws(
    () =>
      planRelease({
        packages,
        published: new Set(),
        tagExists: false,
        releaseExists: false,
        pre: PRE,
      }),
    /0\.1\.0-beta\.1/,
  );
});

test("unexpected package set → throws", () => {
  assert.throws(
    () =>
      planRelease({
        packages: pkgs().slice(1),
        published: new Set(),
        tagExists: false,
        releaseExists: false,
        pre: PRE,
      }),
    /package set/,
  );
});

test("stable release goes to latest and is not a prerelease", () => {
  const p = planRelease({
    packages: pkgs("0.2.0"),
    published: new Set(),
    tagExists: false,
    releaseExists: false,
    pre: null,
  });
  assert.equal(p.distTag, "latest");
  assert.equal(p.prerelease, false);
});

const CORE = `# @speel/core

## 0.1.0-beta.2

### Patch Changes

- Fix a thing.

## 0.1.0-beta.1

### Patch Changes

- Older.
`;
const REACT = `# @speel/react

## 0.1.0-beta.2

### Patch Changes

- @speel/core@0.1.0-beta.2
  - @speel/identity@0.1.0-beta.2
`;
const PNPJS = `# @speel/pnpjs

## 0.1.0-beta.2

No changes in this release.
`;

test("releaseNotes keeps real entries and drops dependency bumps and no-change sections", () => {
  const notes = releaseNotes(V, [
    { name: "@speel/react", text: REACT },
    { name: "@speel/core", text: CORE },
    { name: "@speel/pnpjs", text: PNPJS },
  ]);
  assert.equal(
    notes,
    "### @speel/core\n\n#### Patch Changes\n\n- Fix a thing.\n",
  );
});

test("releaseNotes skips a missing CHANGELOG or a missing version section", () => {
  const notes = releaseNotes(V, [
    { name: "@speel/core", text: CORE },
    { name: "@speel/identity", text: "" },
    {
      name: "@speel/migrations",
      text: "# @speel/migrations\n\n## 0.1.0-beta.1\n\n### Patch Changes\n\n- Old.\n",
    },
  ]);
  assert.equal(
    notes,
    "### @speel/core\n\n#### Patch Changes\n\n- Fix a thing.\n",
  );
});

test("releaseNotes with no real entries says so", () => {
  assert.equal(
    releaseNotes(V, [{ name: "@speel/pnpjs", text: PNPJS }]),
    "No package changes in this release.\n",
  );
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test scripts/release-plan.test.mjs`
Expected: FAIL — `Cannot find module …/release-plan.mjs`.

- [ ] **Step 3: Implement `scripts/release-plan.mjs`**

```js
// Pure release planning for scripts/release.mjs: given what the repo says should ship
// and what npm/GitHub already have, decide what to do. Every step is idempotent, so a
// re-run after any failure resumes where the last run stopped.

export const PUBLISH_ORDER = [
  "@speel/core",
  "@speel/identity",
  "@speel/migrations",
  "@speel/pnpjs",
  "@speel/react",
  "@speel/migrations-cli",
];

export function distTagFor(version, pre) {
  const isPrerelease = version.includes("-");
  if (pre?.mode === "pre") {
    if (!isPrerelease)
      throw new Error(
        `${version} is not a prerelease, but .changeset/pre.json is in pre mode`,
      );
    return pre.tag;
  }
  if (isPrerelease)
    throw new Error(
      `${version} is a prerelease, but .changeset/pre.json is not in pre mode`,
    );
  return "latest";
}

export function planRelease({
  packages,
  published,
  tagExists,
  releaseExists,
  pre,
}) {
  const names = packages.map((p) => p.name).sort();
  const expected = [...PUBLISH_ORDER].sort();
  if (names.join() !== expected.join()) {
    throw new Error(
      `unexpected package set: ${names.join(", ")} (expected ${expected.join(", ")})`,
    );
  }
  const versions = [...new Set(packages.map((p) => p.version))];
  if (versions.length !== 1) {
    throw new Error(
      `lockstep broken: ${packages.map((p) => `${p.name}@${p.version}`).join(", ")}`,
    );
  }
  const [version] = versions;
  const distTag = distTagFor(version, pre);
  const toPublish = PUBLISH_ORDER.filter(
    (n) => !published.has(`${n}@${version}`),
  );
  const createRelease = !releaseExists;
  return {
    version,
    tag: `v${version}`,
    distTag,
    prerelease: distTag !== "latest",
    toPublish,
    runGates: toPublish.length > 0,
    createRelease,
    tagExists,
    nothingToDo: toPublish.length === 0 && !createRelease,
  };
}

const DEPENDENCY_BUMP = /^\s*-\s+@speel\/[\w-]+@\S+\s*$/;

/** One package's section for `version`, reduced to real entries grouped by change type. */
function sectionFor(version, text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end === -1) end = lines.length;
  const groups = [];
  let current = null;
  for (const line of lines.slice(start + 1, end)) {
    if (line.startsWith("### ")) {
      current = { heading: line.slice(4).trim(), entries: [] };
      groups.push(current);
    } else if (current && line.trim() !== "" && !DEPENDENCY_BUMP.test(line)) {
      current.entries.push(line);
    }
  }
  const kept = groups.filter((g) => g.entries.length > 0);
  return kept.length ? kept : null;
}

export function releaseNotes(version, changelogs) {
  const byName = new Map(changelogs.map((c) => [c.name, c.text]));
  const parts = [];
  for (const name of PUBLISH_ORDER) {
    const groups = byName.has(name)
      ? sectionFor(version, byName.get(name))
      : null;
    if (!groups) continue;
    const body = groups
      .map((g) => `#### ${g.heading}\n\n${g.entries.join("\n")}\n`)
      .join("\n");
    parts.push(`### ${name}\n\n${body}`);
  }
  return parts.length
    ? parts.join("\n")
    : "No package changes in this release.\n";
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test scripts/release-plan.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write --log-level warn scripts && npm run test:scripts
git add scripts && git commit -q -m "ci: pure release planning and release notes, with tests" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Release executor

**Files:**

- Create: `scripts/release.mjs`
- Modify: `package.json` (script `release`)

**Interfaces:**

- Consumes: `PUBLISH_ORDER`, `planRelease`, `releaseNotes` from Task 3; `.changeset/pre.json` from Task 1.
- Produces: `npm run release [-- --dry-run]` — the `publish-script` of Task 5. Needs `GITHUB_TOKEN` (or `GH_TOKEN`) for `gh` when not dry-running.

- [ ] **Step 1: Implement `scripts/release.mjs`**

```js
#!/usr/bin/env node
// `npm run release` — the publish step changesets/action runs on main when no
// changesets are pending. Plans from npm + GitHub state (./release-plan.mjs), then:
// gates → publish (OIDC, provenance, explicit dist-tag) → one vX.Y.Z tag + GitHub release.
// Idempotent: re-run the job after any failure. `--dry-run` prints the plan only.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planRelease, releaseNotes } from "./release-plan.mjs";

const dryRun = process.argv.includes("--dry-run");

const capture = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" });
function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0)
    throw new Error(`${cmd} ${args.join(" ")} exited with ${r.status}`);
}

const manifests = readdirSync("packages").map((d) => ({
  dir: join("packages", d),
  ...JSON.parse(readFileSync(join("packages", d, "package.json"), "utf8")),
}));
const packages = manifests.map(({ name, version }) => ({ name, version }));
const pre = existsSync(".changeset/pre.json")
  ? JSON.parse(readFileSync(".changeset/pre.json", "utf8"))
  : null;

// Exact-version views print the version when it exists; anything else means unpublished.
const published = new Set(
  packages
    .filter(
      (p) =>
        capture("npm", [
          "view",
          `${p.name}@${p.version}`,
          "version",
        ]).stdout.trim() === p.version,
    )
    .map((p) => `${p.name}@${p.version}`),
);
const version = packages[0].version;
const tagExists =
  capture("git", [
    "ls-remote",
    "--exit-code",
    "--tags",
    "origin",
    `refs/tags/v${version}`,
  ]).status === 0;
const releaseExists =
  capture("gh", ["release", "view", `v${version}`]).status === 0;

const plan = planRelease({
  packages,
  published,
  tagExists,
  releaseExists,
  pre,
});
console.log(
  `release ${plan.tag} → dist-tag "${plan.distTag}"\n` +
    `  publish: ${plan.toPublish.length ? plan.toPublish.join(", ") : "(all published)"}\n` +
    `  gates: ${plan.runGates ? "yes" : "no"} · tag exists: ${plan.tagExists} · create release: ${plan.createRelease}`,
);

if (dryRun) {
  console.log("dry run — nothing executed");
  process.exit(0);
}
if (plan.nothingToDo) {
  console.log(`${plan.tag} is fully published and released — nothing to do`);
  process.exit(0);
}

if (plan.runGates) {
  for (const script of ["build", "check:node-esm", "typecheck", "test"])
    run("npm", ["run", script]);
}
for (const name of plan.toPublish) {
  run("npm", [
    "publish",
    "--workspace",
    name,
    "--tag",
    plan.distTag,
    "--access",
    "public",
    "--provenance",
  ]);
}
if (plan.createRelease) {
  const notes = releaseNotes(
    plan.version,
    manifests.map((m) => {
      const file = join(m.dir, "CHANGELOG.md");
      return {
        name: m.name,
        text: existsSync(file) ? readFileSync(file, "utf8") : "",
      };
    }),
  );
  const notesFile = join(
    mkdtempSync(join(tmpdir(), "speel-release-")),
    "notes.md",
  );
  writeFileSync(notesFile, notes);
  const sha = capture("git", ["rev-parse", "HEAD"]).stdout.trim();
  run("gh", [
    "release",
    "create",
    plan.tag,
    "--title",
    plan.tag,
    "--notes-file",
    notesFile,
    ...(plan.tagExists ? ["--verify-tag"] : ["--target", sha]),
    ...(plan.prerelease ? ["--prerelease"] : []),
  ]);
}
console.log(`released ${plan.tag}`);
```

- [ ] **Step 2: Root script**

Add to root `package.json` `scripts`: `"release": "node scripts/release.mjs"`.

- [ ] **Step 3: Dry-run against the live registry**

Run (needs network — `dangerouslyDisableSandbox: true`): `npm run release -- --dry-run`
Expected (the repo is at `0.1.0-beta.1`, fully published and released):

```
release v0.1.0-beta.1 → dist-tag "beta"
  publish: (all published)
  gates: no · tag exists: true · create release: false
dry run — nothing executed
```

- [ ] **Step 4: Dry-run a simulated fresh version**

```bash
X="$TMPDIR/rel-dry"; rm -rf "$X"; git clone -q "$PWD" "$X"; cd "$X"
node -e 'const fs=require("fs");for(const d of fs.readdirSync("packages")){const f=`packages/${d}/package.json`;const p=JSON.parse(fs.readFileSync(f));p.version="0.1.0-beta.99";fs.writeFileSync(f,JSON.stringify(p,null,2)+"\n")}'
node scripts/release.mjs --dry-run; cd - && rm -rf "$X"
```

Expected: `publish: @speel/core, @speel/identity, @speel/migrations, @speel/pnpjs, @speel/react, @speel/migrations-cli`, `gates: yes · tag exists: false · create release: true`.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write --log-level warn scripts package.json && npm run format:check
git add -A && git commit -q -m "ci: idempotent release script (npm run release)" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Workflows

**Files:**

- Modify: `.github/workflows/release.yml` (full rewrite)
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `npm run version-packages` (Task 1), `npm run release` (Task 4), `node scripts/check-changeset.mjs` (Task 2).
- Produces: status-check contexts `verify` and `changeset` (job names) for Task 7's ruleset.

- [ ] **Step 1: Rewrite `.github/workflows/release.yml`**

```yaml
# Releases @speel/* with Changesets. On every push to main:
#   - changesets pending → create/update the "Version Packages" PR (authored by the
#     release GitHub App, so ci.yml runs on it)
#   - none pending (a Version PR just merged) → `npm run release`: gates, publish via
#     npm trusted publishing (OIDC + provenance, no token), one vX.Y.Z tag + release
#   - only empty changesets pending → nothing
# npm trusts THIS FILENAME. Renaming it breaks publishing.

name: Release

on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write # npm trusted publishing + provenance

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - id: app
        uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0
        with:
          client-id: ${{ secrets.RELEASE_APP_CLIENT_ID }}
          private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}

      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version
          registry-url: https://registry.npmjs.org
          cache: npm

      # Trusted publishing needs npm >= 11.5.1.
      - run: npm install -g npm@11

      - run: npm ci

      # No GITHUB_TOKEN env here: the action rejects one that differs from
      # github-token, and exports the App token to the publish script itself.
      - uses: changesets/action@ae32849d5ba541f9ae29e40e22a623bc13562f51 # v2.1.2
        with:
          github-token: ${{ steps.app.outputs.token }}
          version-script: npm run version-packages
          publish-script: npm run release
          commit-message: "chore(release): version packages"
          pr-title: "chore(release): version packages"
          create-github-releases: false
          push-git-tags: false
```

- [ ] **Step 2: Update `.github/workflows/ci.yml`**

```yaml
# Every PR: format + the full verify gate, and the changeset check.
# (No push-to-main trigger: the Version Packages PR's CI is the post-merge check.)
name: CI

on:
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version
          cache: npm
          cache-dependency-path: |
            package-lock.json
            registry/package-lock.json
            samples/spfx-sample/package-lock.json

      - run: npm ci
      - run: npm ci --prefix registry
      - run: npm ci --prefix samples/spfx-sample
      - run: npm run format:check
      - run: npm run verify

  changeset:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0 # the check diffs against origin/<base>

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version

      - run: node scripts/check-changeset.mjs
        env:
          PR_HEAD_REF: ${{ github.head_ref }}
          PR_AUTHOR: ${{ github.event.pull_request.user.login }}
```

- [ ] **Step 3: Validate**

```bash
python3 -c "import yaml;[yaml.safe_load(open(f)) for f in ['.github/workflows/release.yml','.github/workflows/ci.yml']];print('yaml ok')"
npx prettier --check .github
grep -n "uses:" .github/workflows/*.yml
```

Expected: `yaml ok`; prettier clean; every `uses:` line is one of the four pinned SHAs in Global Constraints.

- [ ] **Step 4: Commit**

```bash
git add .github && git commit -q -m "ci: release.yml runs changesets/action; ci.yml PR-only with changeset check" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Docs

**Files:**

- Modify: `CLAUDE.md` ("Releasing" section)
- Modify: `CHANGELOG.md` (root; header pointer)

- [ ] **Step 1: Replace CLAUDE.md's "Releasing" section with**

```markdown
## Releasing

Changesets drives versions; never hand-edit a package version. Every PR that touches
`packages/` adds a changeset (`npx changeset`, or `npx changeset --empty` for changes
that should not release) — CI's `changeset` check enforces it and rejects `major`
before 1.0 (use `minor` for breaking changes under 0.x). All six `@speel/*` packages
are one fixed group (lockstep until 1.0) in pre mode on `beta`.

`release.yml` keeps a standing "Version Packages" PR (authored by the release GitHub
App) up to date on every merge to `main`; **merging it is the release** — it publishes
via npm trusted publishing (no tokens; renaming `release.yml` breaks the trust),
creates one `vX.Y.Z` tag and one GitHub release. A failed release is fixed by
re-running the job (`scripts/release.mjs` is idempotent; `npm run release -- --dry-run`
shows its plan). Moving `latest` during the beta stays manual (`npm dist-tag add`,
needs the owner's 2FA). All changes to `main` go through PRs (required checks
`verify` and `changeset`).
```

- [ ] **Step 2: Root CHANGELOG pointer** — replace the paragraph under `# Changelog` with:

```markdown
From 0.1.0-beta.2 on, each package keeps its own `CHANGELOG.md`
(`packages/<pkg>/CHANGELOG.md`, also shipped in its npm tarball), and every release
has one GitHub release (`vX.Y.Z`) collecting them. The entries below are the history
from before Changesets. All `@speel/*` packages are versioned in lockstep until 1.0.
```

- [ ] **Step 3: Format and commit**

```bash
npx prettier --write --log-level warn CLAUDE.md CHANGELOG.md && npm run format:check
git add -A && git commit -q -m "docs: releasing with changesets" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Before committing, scan every file this branch adds or changes for consumer references (the
pattern lives in the executor's private notes and is never committed; see CLAUDE.md "Public
repo"). Expected: no matches.

---

### Task 7: Full gate, PR, and cutover

**Files:** none (verification + GitHub operations).

- [ ] **Step 1: Full gate**

```bash
npm install --cache "$TMPDIR/npm-cache" --prefix registry >/dev/null 2>&1
npm install --cache "$TMPDIR/npm-cache" --prefix samples/spfx-sample >/dev/null 2>&1
git checkout -- registry/package-lock.json samples/spfx-sample/package-lock.json
npm run format:check && npm run verify
```

Expected: exit 0 (test:scripts 24 pass; all package suites pass; registry + sample builds pass).

- [ ] **Step 2: Push and open the PR** (network: `dangerouslyDisableSandbox: true`)

```bash
git push -u origin feat/changesets-release
gh pr create -R backlundpf/speel --base main --head feat/changesets-release \
  --title "ci: release automation with Changesets" --body-file <(printf '%s\n' \
  "Implements docs/superpowers/specs/2026-09-29-changesets-release-design.md." "" \
  "- release.yml: changesets/action with a GitHub App token; Version Packages PR; idempotent npm run release (one vX.Y.Z tag + release)" \
  "- ci.yml: PR-only; new changeset job (package changes need a changeset; no major before 1.0)" \
  "- .changeset config: fixed group over @speel/*, pre mode on beta" \
  "" "Merge only after the owner setup + allowlist step (see plan Task 7)." "" \
  "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
```

Expected: PR URL; CI runs **both** `verify` and `changeset` on it (the PR's own ci.yml) and both pass — `changeset` reports the empty changeset.

- [ ] **Step 3: Owner setup — ask the user, then wait**

Tell the user to: create GitHub App (Settings → Developer settings → GitHub Apps → New): no webhook; Repository permissions Contents: read & write, Pull requests: read & write; install on `backlundpf/speel` only; generate a private key. Then add repo secrets `RELEASE_APP_CLIENT_ID` (the App's Client ID) and `RELEASE_APP_PRIVATE_KEY` (the `.pem` contents). Verify afterwards:

```bash
gh secret list -R backlundpf/speel
```

Expected: both names listed.

- [ ] **Step 4: Allow changesets/action**

```bash
gh api -X PUT repos/backlundpf/speel/actions/permissions/selected-actions --input - <<'EOF'
{"github_owned_allowed":true,"verified_allowed":false,"patterns_allowed":["changesets/action@ae32849d5ba541f9ae29e40e22a623bc13562f51"]}
EOF
gh api repos/backlundpf/speel/actions/permissions/selected-actions
```

Expected: `patterns_allowed` contains the pinned changesets/action.

- [ ] **Step 5: User merges the PR; watch the first release.yml run**

```bash
id=$(gh run list -R backlundpf/speel --workflow Release --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$id" -R backlundpf/speel --exit-status
gh run view "$id" -R backlundpf/speel --log | grep -E "All changesets are empty|Not creating PR"
```

Expected: success; log shows `All changesets are empty. Not creating PR` (token minted, action loaded, nothing released).

- [ ] **Step 6: Require PRs + checks on main**

```bash
gh api -X PUT repos/backlundpf/speel/rulesets/24130533 --input - <<'EOF'
{"name":"Protect main","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
 "bypass_actors":[],
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"},{"type":"required_linear_history"},
  {"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false,"allowed_merge_methods":["squash"]}},
  {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"required_status_checks":[{"context":"verify","integration_id":15368},{"context":"changeset","integration_id":15368}]}}]}
EOF
gh api repos/backlundpf/speel/rulesets/24130533 --jq '[.rules[].type]'
```

Expected: `["deletion","non_fast_forward","required_linear_history","pull_request","required_status_checks"]`.

- [ ] **Step 7: Clean up**

Remove the worktree and branch after merge (own Bash call, anchored at the repo root; see memory "Anchor destructive git"). The first real release (`0.1.0-beta.2`) happens with the next PR that carries a non-empty changeset.
