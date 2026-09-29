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
  assert.equal(isChangesetPath(".changeset/pre/brave-owls.md"), false);
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
