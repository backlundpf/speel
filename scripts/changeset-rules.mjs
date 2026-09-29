// Pure rules behind the PR changeset check. scripts/check-changeset.mjs feeds them
// the PR's diff; keeping the rules I/O-free is what makes them testable. Parsing
// uses the CLI's own parser, so the check accepts exactly what `changeset version`
// will accept on main.
import parse from "@changesets/parse";

export const EXEMPT_AUTHORS = ["dependabot[bot]"];
export const VERSION_PR_BRANCH = "changeset-release/main";
export const RELEASE_MODE_LABEL = "release-mode";

/** A pending changeset file: `.changeset/<name>.md`, never the README or `pre/`. */
export function isChangesetPath(path) {
  return (
    /^\.changeset\/[^/]+\.md$/.test(path) && path !== ".changeset/README.md"
  );
}

/** The releases a changeset declares, via the CLI's parser; throws what it throws. */
export function parseChangeset(content) {
  const { releases } = parse(content);
  return { releases: releases.map(({ name, type }) => ({ name, type })) };
}

function isExempt({ author, headRef }) {
  if (EXEMPT_AUTHORS.includes(author)) return true;
  // The Version PR: the release App's bot on its branch. A human (or a fork) naming a
  // branch changeset-release/main gets no pass.
  return headRef === VERSION_PR_BRANCH && author.endsWith("[bot]");
}

export function checkChangesets({
  changedFiles,
  touchedChangesets,
  pendingChangesets,
  versionEdits,
  preJsonChanged,
  labels,
  headRef,
  author,
  preMode,
  packageNames,
}) {
  if (isExempt({ author, headRef })) {
    return {
      ok: true,
      errors: [],
      notes: [`exempt (${author} on ${headRef})`],
    };
  }
  const errors = [];
  const notes = [];
  // Every pending changeset, not only this PR's: one bad file breaks `changeset version`
  // on main for everyone.
  for (const { path, content } of pendingChangesets) {
    let releases;
    try {
      ({ releases } = parseChangeset(content));
    } catch (e) {
      errors.push(`${path}: ${e.message.split("\n")[0]}`);
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
  if (touchesPackages && touchedChangesets.length === 0) {
    errors.push(
      "This PR changes packages/ but adds no changeset. Run `npx changeset` " +
        "(or `npx changeset --empty` for changes that should not release) and commit the file.",
    );
  }
  for (const path of versionEdits) {
    errors.push(
      `${path}: "version" was edited by hand. Versions come only from changesets — ` +
        "revert it and add a changeset instead.",
    );
  }
  if (preJsonChanged && !labels.includes(RELEASE_MODE_LABEL)) {
    errors.push(
      `.changeset/pre.json changed. Entering or leaving prerelease mode is deliberate: ` +
        `add the "${RELEASE_MODE_LABEL}" label to this PR if that is the intent.`,
    );
  }
  return { ok: errors.length === 0, errors, notes };
}
