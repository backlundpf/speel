import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const release = readFileSync(".github/workflows/release.yml", "utf8");

test("release.yml publishes any unreleased version on main before changesets/action runs", () => {
  const releaseStep = release.indexOf("run: npm run release");
  const action = release.indexOf("uses: changesets/action@");
  assert.notEqual(releaseStep, -1, "a `run: npm run release` step");
  assert.notEqual(action, -1, "the changesets/action step");
  assert.ok(releaseStep < action, "release runs first");
});
