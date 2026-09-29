#!/usr/bin/env node
// PR changeset check: the git/env wrapper around ./changeset-rules.mjs.
// CI: ci.yml's `changeset` job (checkout with fetch-depth: 0, after `npm ci`).
// Locally: `npm run check:changeset` compares committed HEAD against origin/main.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { checkChangesets, isChangesetPath } from "./changeset-rules.mjs";

const base = `origin/${process.env.GITHUB_BASE_REF || "main"}`;
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const lines = (s) => s.split("\n").filter(Boolean);

let mergeBase;
try {
  mergeBase = git("merge-base", base, "HEAD").trim();
} catch {
  console.error(
    `check-changeset: no merge base with ${base}. Fetch it first ` +
      "(CI: actions/checkout with fetch-depth: 0; locally: git fetch origin).",
  );
  process.exit(2);
}

const changedFiles = lines(git("diff", "--name-only", `${mergeBase}...HEAD`));
const touchedChangesets = lines(
  git(
    "diff",
    "--name-only",
    "--diff-filter=AM",
    `${mergeBase}...HEAD`,
    "--",
    ".changeset",
  ),
).filter(isChangesetPath);
const pendingChangesets = readdirSync(".changeset")
  .map((f) => `.changeset/${f}`)
  .filter(isChangesetPath)
  .map((path) => ({ path, content: readFileSync(path, "utf8") }));

// A manifest whose "version" differs from the merge base's was edited by hand.
const versionOf = (json) => JSON.parse(json).version;
const versionEdits = changedFiles.filter((path) => {
  if (!/^packages\/[^/]+\/package\.json$/.test(path) || !existsSync(path))
    return false;
  let before;
  try {
    before = versionOf(git("show", `${mergeBase}:${path}`));
  } catch {
    return false; // a new package: no prior version to compare
  }
  return versionOf(readFileSync(path, "utf8")) !== before;
});

const packageNames = readdirSync("packages").map(
  (d) => JSON.parse(readFileSync(`packages/${d}/package.json`, "utf8")).name,
);
const preMode =
  existsSync(".changeset/pre.json") &&
  JSON.parse(readFileSync(".changeset/pre.json", "utf8")).mode === "pre";
let labels = [];
try {
  labels = JSON.parse(process.env.PR_LABELS || "[]");
} catch {
  labels = [];
}

const result = checkChangesets({
  changedFiles,
  touchedChangesets,
  pendingChangesets,
  versionEdits,
  preJsonChanged: changedFiles.includes(".changeset/pre.json"),
  labels,
  headRef: process.env.PR_HEAD_REF ?? "",
  author: process.env.PR_AUTHOR ?? "",
  preMode,
  packageNames,
});
for (const n of result.notes) console.log(n);
for (const e of result.errors) console.error(`✗ ${e}`);
if (result.ok) console.log("✓ changeset check passed");
process.exit(result.ok ? 0 : 1);
