import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Comments may name the script; only the workflow's own lines count.
const release = readFileSync(".github/workflows/release.yml", "utf8")
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");

test("release.yml runs npm run release only as changesets/action's publish-script", () => {
  assert.equal(release.match(/npm run release/g)?.length, 1, "one call site");
  assert.match(release, /^\s+publish-script: npm run release$/m);
  assert.doesNotMatch(release, /run: npm run release/);
});
