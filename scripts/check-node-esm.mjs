// Imports every workspace package's published entry points under plain Node.
// Bundlers and vitest tolerate module specifiers Node's ESM loader rejects (for
// example extensionless relative imports), so this catches a dist that only
// works when bundled. Run after `npm run build`.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// @speel/react is always bundled (SPFx externalizes React), and React 17 ships no
// `exports` map, so Node can't resolve the `react/jsx-runtime` that tsc emits. Its own
// relative specifiers are still enforced by NodeNext in its tsconfig.
const SKIP = new Set(["@speel/react"]);

const root = new URL("../packages/", import.meta.url);
let failed = 0;

for (const dir of readdirSync(root)) {
  const pkgDir = new URL(`${dir}/`, root);
  if (!existsSync(new URL("package.json", pkgDir))) continue;
  const pkg = JSON.parse(readFileSync(new URL("package.json", pkgDir), "utf8"));
  if (SKIP.has(pkg.name)) {
    console.log(`skip  ${pkg.name} (bundler-only; see SKIP)`);
    continue;
  }
  const targets = Object.values(pkg.exports ?? { ".": { import: pkg.main } })
    .map((e) => (typeof e === "string" ? e : e.import))
    .filter(Boolean);
  for (const target of targets) {
    const url = pathToFileURL(join(pkgDir.pathname, target)).href;
    try {
      await import(url);
      console.log(`ok    ${pkg.name} ${target}`);
    } catch (err) {
      failed++;
      console.error(`FAIL  ${pkg.name} ${target}\n      ${err.message}`);
    }
  }
}

process.exit(failed ? 1 : 0);
