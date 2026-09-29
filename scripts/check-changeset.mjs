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
