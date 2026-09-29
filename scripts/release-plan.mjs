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
  const toPublish = PUBLISH_ORDER.filter(
    (n) => !published.has(`${n}@${version}`),
  );
  const createRelease = !releaseExists;
  const nothingToDo = toPublish.length === 0 && !createRelease;
  // A finished release needs no dist-tag: after `pre exit`, the still-current
  // prerelease is published and released, and must not fail every push.
  const distTag = nothingToDo ? null : distTagFor(version, pre);
  return {
    version,
    tag: `v${version}`,
    distTag,
    prerelease: distTag !== null && distTag !== "latest",
    toPublish,
    runGates: toPublish.length > 0,
    createRelease,
    tagExists,
    nothingToDo,
  };
}

/** `npm view <name>@<version> version`: the version → published; E404 → not; else throw. */
export function npmPublished({ status, stdout, stderr }, version) {
  if (status === 0 && stdout.trim() === version) return true;
  if (/\bE404\b/.test(stderr)) return false;
  throw new Error(`npm view failed (exit ${status}): ${stderr.trim()}`);
}

/** `gh release view <tag>`: exit 0 → exists; "release not found" → not; else throw. */
export function releaseFound({ status, stderr }) {
  if (status === 0) return true;
  if (/release not found/i.test(stderr)) return false;
  throw new Error(`gh release view failed (exit ${status}): ${stderr.trim()}`);
}

/** `git ls-remote --exit-code`: 0 → tag exists; 2 → no such ref; else throw. */
export function tagFound({ status, stderr }) {
  if (status === 0) return true;
  if (status === 2) return false;
  throw new Error(`git ls-remote failed (exit ${status}): ${stderr.trim()}`);
}

// Dependency-bump bookkeeping the CLI writes into every dependent's section.
const DEPENDENCY_BUMP =
  /^\s*-\s+(?:@speel\/[\w-]+@\S+|(?:[0-9a-f]{7,}:\s+)?Updated dependencies(?:\s+\[[^\]]*\])?)\s*$/;

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
