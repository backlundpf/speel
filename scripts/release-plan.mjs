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
