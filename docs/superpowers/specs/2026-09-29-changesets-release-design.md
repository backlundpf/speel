# Changesets release automation — design

Date: 2026-09-29 · Status: approved; updated with config-experiment results

## Goal

Consistent versioning and no room for release-day user error. Versions come only from
changeset files — never hand-edited. A release is the act of merging the bot's "Version
Packages" PR; there is no tag to push and nothing to bump by hand.

## Decisions

| Topic                 | Decision                                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versioning            | Lockstep until 1.0: one Changesets `fixed` group over all six `@speel/*` packages. Independent versioning is revisited at 1.0 (drop the group).                      |
| Prereleases           | Changesets pre mode on the `beta` tag; next version after `0.1.0-beta.1` is `0.1.0-beta.2`.                                                                          |
| Version PR author     | A GitHub App (short-lived installation token via `actions/create-github-app-token`), so `ci.yml` runs on the Version PR and "Allow Actions to create PRs" stays off. |
| Automation            | `changesets/action` inside `release.yml` (approach A).                                                                                                               |
| Changeset enforcement | Required on every PR that touches `packages/`; `--empty` satisfies it; enforced as a required status check.                                                          |
| Tags / releases       | One `vX.Y.Z` tag and one GitHub release per version, created by our release script (`changeset publish` is not used; no per-package tags).                           |
| CHANGELOGs            | Per-package `CHANGELOG.md` (Changesets native). Root `CHANGELOG.md` frozen as beta.0/beta.1 history plus a pointer.                                                  |
| PR-only main          | "Protect main" gains a pull-request rule and required status checks — every change to `main` goes through a PR, no bypass.                                           |

## Flow

```
feature PR ──▶ ci.yml: verify + changeset ──▶ squash-merge
                                                  │ push to main
                                                  ▼
                              release.yml (changesets/action)
                              ├─ pending changesets → create/update Version PR (App-authored)
                              └─ none pending → npm run release
                                   (exits early if everything is published and released)
Version PR ──▶ ci.yml: verify ──▶ squash-merge = release decision ──▶ release.yml publishes
```

The Version PR is standing: each merge to `main` refreshes it; leaving it open batches more
changes into the next version. Nothing publishes until it is merged.

## Components

### `release.yml` (filename fixed — npm trusted publishing is bound to it)

- Trigger `push: branches: [main]`; `concurrency: release`, no cancel-in-progress.
- Workflow token: `contents: read`, `id-token: write` only.
- Steps: checkout → setup-node (`.node-version`, registry URL) → `npm install -g npm@11`
  (trusted publishing needs ≥ 11.5.1) → mint App token (`actions/create-github-app-token`,
  secrets `RELEASE_APP_CLIENT_ID`, `RELEASE_APP_PRIVATE_KEY`; v3 takes `client-id`, `app-id` is deprecated) → `npm ci` → `changesets/action`
  (SHA-pinned) with `version: npm run version-packages`, `publish: npm run release`,
  `createGithubReleases: false`, `GITHUB_TOKEN` = the App token.
- All GitHub writes (Version PR branch/PR, tag, release) use the App token.

### `ci.yml`

- Trigger: `pull_request` only (the `push: main` trigger is removed — the Version PR's CI is
  the post-merge check of `main` plus the bumps).
- Job `verify`: unchanged (`format:check` + `npm run verify`).
- Job `changeset`: `npm run check:changeset` against the PR base.

### `scripts/check-changeset.mjs` (`npm run check:changeset`)

A pure rule function over (changed files, added changeset files, PR head branch, PR author,
pre-mode flag) plus a thin git/env wrapper. Rules:

1. Any changed path under `packages/` requires ≥ 1 added `.changeset/*.md` (an `--empty`
   changeset counts).
2. Changes only outside `packages/` require nothing.
3. While `.changeset/pre.json` exists, an added changeset declaring `major` fails, with a
   message to use `minor` for breaking changes under 0.x.
4. Exempt: author `dependabot[bot]`; head branch `changeset-release/main`.

Failure messages name the rule and the fix (`npx changeset` / `npx changeset --empty`).

### `npm run version-packages`

`changeset version` → `npm install --package-lock-only` → prettier on the CHANGELOGs.

### `scripts/release.mjs` (`npm run release [-- --dry-run]`)

A pure plan function over (package versions, per-package published flags, tag exists,
release exists, pre state) plus an executor. Steps, each idempotent:

1. Assert all six versions are identical (error otherwise). Dist-tag = pre mode's tag when
   in pre mode, else `latest`.
2. If all six `name@version` are on npm and the `vX.Y.Z` release exists → exit 0 without
   running gates.
3. Gates: `build`, `check:node-esm`, `typecheck`, `test`.
4. Publish in dependency order core → identity → migrations → pnpjs → react →
   migrations-cli with `--tag <dist-tag> --access public --provenance`; skip published.
5. Create tag `vX.Y.Z` at the released commit (skip if it exists).
6. Create the GitHub release for the tag (prerelease in pre mode); notes = that version's
   section from each package CHANGELOG, only where it has entries (skip if it exists).

Tag and release come only after all six are published. `--dry-run` executes nothing and
prints the plan. Recovery from any failure is re-running the job.

### Repo files

- `@changesets/cli` pinned root devDependency; root scripts `changeset`, `version-packages`,
  `release`, `check:changeset`.
- `.changeset/config.json`: `fixed: [["@speel/*"]]`, `access: "public"`,
  `baseBranch: "main"`, default changelog generator, `privatePackages` off. No
  experimental peer option: the experiment showed the fixed group never cascades to `1.0.0`.
- `.changeset/pre.json`: written by `changeset pre enter beta`; no seeding — the next
  version comes out `0.1.0-beta.2` from the current `0.1.0-beta.1`.
- Each package's `publishConfig.tag` is removed (the release script passes the dist-tag;
  a stale `beta` there would mislead a manual publish after pre mode exits).
- `.changeset/README.md`: when to add a changeset, patch vs minor under 0.x, `--empty`.
- Each package's `files` gains `CHANGELOG.md`.
- CLAUDE.md "Releasing" rewritten; root `CHANGELOG.md` gains the pointer.

### GitHub settings

- Actions allowlist: add `changesets/action@<sha>` (`actions/create-github-app-token` is
  GitHub-owned and already allowed).
- "Protect main": add a pull-request rule (0 approvals) and required status checks
  `verify` and `changeset`.
- Unchanged: "Allow Actions to create PRs" off; "Protect release tags" (creation allowed,
  update/delete blocked).

### Owner setup (manual, one-time)

- GitHub App `speel-release` (name flexible): no webhook; repository permissions Contents
  read & write, Pull requests read & write; installed on `backlundpf/speel` only.
- Repo secrets `RELEASE_APP_CLIENT_ID` (the App's Client ID) and `RELEASE_APP_PRIVATE_KEY`.
- npm: no change (workflow filename stays `release.yml`; trusted publishers allow publish).

## Testing

- `check-changeset`: fixture tests (node:test) for each rule and exemption.
- `release` plan: unit tests for nothing-to-do, partial re-run, fresh release, version
  mismatch; `--dry-run` against the live registry locally.
- Changesets config experiment — **run 2026-09-29 against `@changesets/cli` 3.0.3**:
  - `patch` in pre mode → all six `0.1.0-beta.2`; a second patch → `0.1.0-beta.3`.
  - `minor` in pre mode from `0.1.0-beta.N` → `0.1.0-beta.N+1` (semver: `0.1.0` is already
    the next minor); from stable `0.1.0` → all six `0.2.0`, peers widened to `^0.2.0`.
  - Never `1.0.0`, with or without the experimental peer option — so it is not used.
  - Peers are re-pinned to `^<new version>` each release, and workspace `"*"`
    devDependencies become exact pins (`0.1.0-beta.2`); npm workspaces still link them
    (verified with `npm ci`). Accepted: both are consistent with lockstep.
  - CHANGELOG quirks the release-notes builder must handle: an untouched package gets
    `No changes in this release.`; dependents get `- @speel/<pkg>@<version>` bullets.
  - Generated CHANGELOGs already pass prettier (v3 `format: "auto"`).

## Cutover

1. Implementation PR (merges under the current rules; no changeset check on `main` yet).
2. Before merging: owner creates the App + secrets; allowlist gains `changesets/action`.
3. Merge → first `release.yml` run on `main`. This PR carries only an `--empty`
   changeset, and changesets/action does nothing while only empty changesets are pending
   (no PR, no publish) — proves the App token and the action load. The publish path is
   first exercised by step 5.
4. Add the required status checks to "Protect main".
5. First real release: the next change with a changeset → Version PR → merge →
   `0.1.0-beta.2` end to end.

Rollback: revert the implementation PR; the tag-triggered flow returns and npm trust is
unaffected.

## Out of scope

- Independent versioning and per-package tags/releases (revisit at 1.0).
- Staged npm publishing (`npm stage publish`) — revisit before 1.0.
- Moving `latest` during the beta stays a manual `npm dist-tag` step (trusted publishing
  cannot move dist-tags).
