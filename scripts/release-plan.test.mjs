import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PUBLISH_ORDER,
  npmPublished,
  releaseFound,
  tagFound,
  distTagFor,
  planRelease,
  releaseNotes,
} from "./release-plan.mjs";

const V = "0.1.0-beta.2";
const PRE = { mode: "pre", tag: "beta" };
const pkgs = (v = V) => PUBLISH_ORDER.map((name) => ({ name, version: v }));
const all = (v = V) => new Set(PUBLISH_ORDER.map((n) => `${n}@${v}`));
const plan = (o) =>
  planRelease({
    packages: pkgs(),
    published: new Set(),
    tagExists: false,
    releaseExists: false,
    pre: PRE,
    ...o,
  });

test("distTagFor: pre mode → its tag; stable → latest; mismatches throw", () => {
  assert.equal(distTagFor(V, PRE), "beta");
  assert.equal(distTagFor("0.2.0", null), "latest");
  assert.equal(distTagFor("0.2.0", { mode: "exit", tag: "beta" }), "latest");
  assert.throws(() => distTagFor("0.2.0", PRE), /pre mode/);
  assert.throws(() => distTagFor(V, null), /prerelease/);
});

test("fresh release: publish all six in order, gates, then release", () => {
  const p = plan({});
  assert.deepEqual(p.toPublish, PUBLISH_ORDER);
  assert.equal(p.runGates, true);
  assert.equal(p.createRelease, true);
  assert.equal(p.tag, "v0.1.0-beta.2");
  assert.equal(p.distTag, "beta");
  assert.equal(p.prerelease, true);
  assert.equal(p.nothingToDo, false);
});

test("nothing to do when all six are published and the release exists", () => {
  const p = plan({ published: all(), tagExists: true, releaseExists: true });
  assert.equal(p.nothingToDo, true);
  assert.equal(p.runGates, false);
  assert.deepEqual(p.toPublish, []);
});

test("partial re-run publishes only the rest, still in order", () => {
  const p = plan({
    published: new Set([`@speel/core@${V}`, `@speel/identity@${V}`]),
  });
  assert.deepEqual(p.toPublish, [
    "@speel/migrations",
    "@speel/pnpjs",
    "@speel/react",
    "@speel/migrations-cli",
  ]);
  assert.equal(p.runGates, true);
});

test("all published but the release failed: no gates, release against the existing tag", () => {
  const p = plan({ published: all(), tagExists: true, releaseExists: false });
  assert.equal(p.runGates, false);
  assert.deepEqual(p.toPublish, []);
  assert.equal(p.createRelease, true);
  assert.equal(p.tagExists, true);
  assert.equal(p.nothingToDo, false);
});

test("lockstep broken → throws naming the versions", () => {
  const packages = pkgs();
  packages[4] = { name: "@speel/react", version: "0.1.0-beta.1" };
  assert.throws(
    () =>
      planRelease({
        packages,
        published: new Set(),
        tagExists: false,
        releaseExists: false,
        pre: PRE,
      }),
    /0\.1\.0-beta\.1/,
  );
});

test("unexpected package set → throws", () => {
  assert.throws(
    () =>
      planRelease({
        packages: pkgs().slice(1),
        published: new Set(),
        tagExists: false,
        releaseExists: false,
        pre: PRE,
      }),
    /package set/,
  );
});

test("stable release goes to latest and is not a prerelease", () => {
  const p = planRelease({
    packages: pkgs("0.2.0"),
    published: new Set(),
    tagExists: false,
    releaseExists: false,
    pre: null,
  });
  assert.equal(p.distTag, "latest");
  assert.equal(p.prerelease, false);
});

const CORE = `# @speel/core

## 0.1.0-beta.2

### Patch Changes

- Fix a thing.

## 0.1.0-beta.1

### Patch Changes

- Older.
`;
const REACT = `# @speel/react

## 0.1.0-beta.2

### Patch Changes

- Updated dependencies
  - @speel/core@0.1.0-beta.2
  - @speel/identity@0.1.0-beta.2
`;
const PNPJS = `# @speel/pnpjs

## 0.1.0-beta.2

No changes in this release.
`;

test("releaseNotes keeps real entries and drops dependency bumps and no-change sections", () => {
  const notes = releaseNotes(V, [
    { name: "@speel/react", text: REACT },
    { name: "@speel/core", text: CORE },
    { name: "@speel/pnpjs", text: PNPJS },
  ]);
  assert.equal(
    notes,
    "### @speel/core\n\n#### Patch Changes\n\n- Fix a thing.\n",
  );
});

test("releaseNotes skips a missing CHANGELOG or a missing version section", () => {
  const notes = releaseNotes(V, [
    { name: "@speel/core", text: CORE },
    { name: "@speel/identity", text: "" },
    {
      name: "@speel/migrations",
      text: "# @speel/migrations\n\n## 0.1.0-beta.1\n\n### Patch Changes\n\n- Old.\n",
    },
  ]);
  assert.equal(
    notes,
    "### @speel/core\n\n#### Patch Changes\n\n- Fix a thing.\n",
  );
});

test("releaseNotes with no real entries says so", () => {
  assert.equal(
    releaseNotes(V, [{ name: "@speel/pnpjs", text: PNPJS }]),
    "No package changes in this release.\n",
  );
});

test("after pre exit, a fully published prerelease is nothing to do, not an error", () => {
  const p = planRelease({
    packages: pkgs(),
    published: all(),
    tagExists: true,
    releaseExists: true,
    pre: { mode: "exit", tag: "beta" },
  });
  assert.equal(p.nothingToDo, true);
});

test("npmPublished: the version → true; E404 → false; anything else throws", () => {
  assert.equal(
    npmPublished({ status: 0, stdout: `${V}\n`, stderr: "" }, V),
    true,
  );
  assert.equal(
    npmPublished({ status: 1, stdout: "", stderr: "npm error code E404\n" }, V),
    false,
  );
  assert.throws(
    () =>
      npmPublished(
        { status: 1, stdout: "", stderr: "npm error code ETIMEDOUT" },
        V,
      ),
    /ETIMEDOUT/,
  );
});

test("releaseFound: exists → true; 'release not found' → false; anything else throws", () => {
  assert.equal(releaseFound({ status: 0, stderr: "" }), true);
  assert.equal(
    releaseFound({ status: 1, stderr: "release not found\n" }),
    false,
  );
  assert.throws(() => releaseFound({ status: 1, stderr: "HTTP 502" }), /502/);
});

test("tagFound: exit 0 → true; exit 2 (no match) → false; anything else throws", () => {
  assert.equal(tagFound({ status: 0, stderr: "" }), true);
  assert.equal(tagFound({ status: 2, stderr: "" }), false);
  assert.throws(() => tagFound({ status: 128, stderr: "fatal: auth" }), /auth/);
});
