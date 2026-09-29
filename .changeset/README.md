# Changesets

Every PR that touches `packages/` adds a changeset — CI's `changeset` check enforces it.

    npx changeset          # pick any package, pick the bump, write one line for the CHANGELOG
    npx changeset --empty  # tests, internal refactors: records "no release" explicitly

All six `@speel/*` packages are one fixed group: any changeset bumps all of them to the
same version, so which package you pick only decides whose CHANGELOG carries the line.

**Under 0.x:** `patch` for fixes, `minor` for features and breaking changes. `major` is
rejected by CI until 1.0 (it would publish 1.0.0).

CI also rejects hand-edited package `version` fields, and any change to `pre.json` unless
the PR carries the `release-mode` label (entering or leaving prerelease mode is deliberate).

Releasing: merge the bot's "Version Packages" PR. Nothing else.
