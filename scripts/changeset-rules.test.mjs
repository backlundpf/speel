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
  touchedChangesets: [],
  pendingChangesets: [],
  versionEdits: [],
  preJsonChanged: false,
  labels: [],
  headRef: "feat/x",
  author: "someone",
  preMode: true,
  packageNames: NAMES,
};
const cs = (content, path = ".changeset/a.md") => ({ path, content });
const PKG = ["packages/speel-core/src/a.ts"];
const withChangeset = (content, path = ".changeset/a.md") => ({
  ...base,
  changedFiles: [...PKG, path],
  touchedChangesets: [path],
  pendingChangesets: [cs(content, path)],
});

test("parses the CLI's own output", () => {
  assert.deepEqual(parseChangeset('---\n"@speel/core": patch\n---\n\nFix.\n'), {
    releases: [{ name: "@speel/core", type: "patch" }],
  });
});

test("parses single quotes, a quoted bump type and CRLF, as the CLI does", () => {
  const r = parseChangeset(
    '---\r\n\'@speel/core\': minor\r\n"@speel/react": "patch"\r\n---\r\n\r\nX\r\n',
  );
  assert.deepEqual(r.releases, [
    { name: "@speel/core", type: "minor" },
    { name: "@speel/react", type: "patch" },
  ]);
});

test("rejects an unquoted @-name, as the CLI does (invalid YAML)", () => {
  assert.throws(() => parseChangeset("---\n@speel/core: patch\n---\n\nX\n"));
});

test("parses an empty changeset", () => {
  assert.deepEqual(parseChangeset("---\n---\n\nNothing.\n").releases, []);
});

test("rejects malformed frontmatter", () => {
  assert.throws(() => parseChangeset("no frontmatter"));
  assert.throws(() => parseChangeset('---\n"@speel/core": huge\n---\n\nX\n'));
});

test("isChangesetPath: only top-level .md files under .changeset, never the README", () => {
  assert.equal(isChangesetPath(".changeset/brave-owls.md"), true);
  assert.equal(isChangesetPath(".changeset/README.md"), false);
  assert.equal(isChangesetPath(".changeset/config.json"), false);
  assert.equal(isChangesetPath(".changeset/pre/brave-owls.md"), false);
  assert.equal(isChangesetPath("docs/x.md"), false);
});

test("package change without a changeset fails with the fix in the message", () => {
  const r = checkChangesets({ ...base, changedFiles: PKG });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /npx changeset/);
  assert.match(r.errors[0], /--empty/);
});

test("package change with an empty changeset passes", () => {
  const r = checkChangesets(withChangeset("---\n---\n\nTests only.\n"));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test("editing an existing pending changeset satisfies the rule", () => {
  const r = checkChangesets({
    ...base,
    changedFiles: [...PKG, ".changeset/old.md"],
    touchedChangesets: [".changeset/old.md"],
    pendingChangesets: [
      cs('---\n"@speel/core": patch\n---\n\nX\n', ".changeset/old.md"),
    ],
  });
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
    changedFiles: [...PKG, ".changeset/README.md"],
  });
  assert.equal(r.ok, false);
});

test("major is rejected in pre mode, allowed after", () => {
  const major = withChangeset('---\n"@speel/core": major\n---\n\nX\n');
  const pre = checkChangesets(major);
  assert.equal(pre.ok, false);
  assert.match(pre.errors[0], /minor/);
  assert.equal(checkChangesets({ ...major, preMode: false }).ok, true);
});

test("every pending changeset is validated, not only the ones this PR touches", () => {
  const r = checkChangesets({
    ...base,
    changedFiles: ["docs/x.md"],
    pendingChangesets: [
      cs('---\n"@speel/core": major\n---\n\nX\n', ".changeset/old.md"),
    ],
  });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /\.changeset\/old\.md/);
});

test("an unknown package name fails at PR time", () => {
  const r = checkChangesets(
    withChangeset('---\n"@speel/cor": patch\n---\n\nX\n'),
  );
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /@speel\/cor/);
});

test("a malformed changeset fails and names the file", () => {
  const r = checkChangesets(withChangeset("oops", ".changeset/bad.md"));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /\.changeset\/bad\.md/);
});

test("a hand-edited package version fails", () => {
  const r = checkChangesets({
    ...withChangeset("---\n---\n\nX\n"),
    versionEdits: ["packages/speel-core/package.json"],
  });
  assert.equal(r.ok, false);
  assert.match(r.errors.join("\n"), /packages\/speel-core\/package\.json/);
});

test("a pre.json change needs the release-mode label", () => {
  const change = {
    ...base,
    changedFiles: [".changeset/pre.json"],
    preJsonChanged: true,
  };
  const r = checkChangesets(change);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /release-mode/);
  assert.equal(
    checkChangesets({ ...change, labels: ["release-mode"] }).ok,
    true,
  );
});

test("Dependabot and the bot's Version Packages PR are exempt", () => {
  const touching = {
    ...base,
    changedFiles: ["packages/speel-core/package.json"],
    versionEdits: ["packages/speel-core/package.json"],
  };
  assert.equal(
    checkChangesets({ ...touching, author: "dependabot[bot]" }).ok,
    true,
  );
  assert.equal(
    checkChangesets({
      ...touching,
      author: "speel-release[bot]",
      headRef: "changeset-release/main",
    }).ok,
    true,
  );
});

test("a human-authored branch named changeset-release/main is not exempt", () => {
  const r = checkChangesets({
    ...base,
    changedFiles: ["packages/speel-core/package.json"],
    versionEdits: ["packages/speel-core/package.json"],
    headRef: "changeset-release/main",
    author: "someone",
  });
  assert.equal(r.ok, false);
});
