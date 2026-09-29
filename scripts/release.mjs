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
