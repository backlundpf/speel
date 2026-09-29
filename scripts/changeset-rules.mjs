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
