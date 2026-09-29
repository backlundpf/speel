#!/usr/bin/env node
// The registry is where the shadcn skin is authored; the sample imports it from
// there. Copies every file registry/registry.json ships into the sample, at the
// target `shadcn add` would write (the sample's `@/` alias is its src/).
// `npm run sync:skin` rewrites the sample's copies; `npm run check:skin` (part
// of `verify`) fails when any copy differs from the registry source.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY = "registry";
const SAMPLE_SRC = "samples/spfx-sample/src";

/** Every shipped skin file as { from, to }, repo-relative. */
export function skinFiles(root) {
  const registry = JSON.parse(
    readFileSync(join(root, REGISTRY, "registry.json"), "utf8"),
  );
  return registry.items.flatMap((item) =>
    item.files.map((f) => ({
      from: `${REGISTRY}/${f.path}`,
      to: `${SAMPLE_SRC}/${f.target}`,
    })),
  );
}

/** Copies stale sample files (unless `check`); returns the ones that were stale. */
export function syncSkin(root, { check = false } = {}) {
  const stale = [];
  for (const { from, to } of skinFiles(root)) {
    const source = readFileSync(join(root, from));
    const dest = join(root, to);
    if (existsSync(dest) && readFileSync(dest).equals(source)) continue;
    stale.push(to);
    if (!check) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(root, from), dest);
    }
  }
  return { stale };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const check = process.argv.includes("--check");
  const { stale } = syncSkin(root, { check });
  if (check && stale.length > 0) {
    console.error(
      "check:skin: the sample's shadcn skin differs from the registry source.\n" +
        "Author skin changes in registry/src/speel-shadcn, then run `npm run sync:skin`.\n" +
        stale.map((p) => `  ${p}`).join("\n"),
    );
    process.exit(1);
  }
  if (!check) {
    console.log(
      stale.length === 0
        ? "sync:skin: sample already matches the registry."
        : `sync:skin: updated\n${stale.map((p) => `  ${p}`).join("\n")}`,
    );
  }
}
