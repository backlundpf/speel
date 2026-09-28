// Rewrites module specifiers in TypeScript source to the form Node's ESM loader
// accepts (see "Module specifiers" in CLAUDE.md):
//
//   ./Foo              -> ./Foo.js               (Foo.ts / Foo.tsx / Foo.d.ts exists)
//   ./dir              -> ./dir/index.js         (dir/index.ts(x) exists)
//   @pnp/sp/webs       -> @pnp/sp/webs/index.js  (deep import into a package with
//   @pnp/sp/batching   -> @pnp/sp/batching.js     no `exports` map)
//
// Covers `from "…"`, `import "…"`, `import("…")`, `declare module "…"` and
// vi.mock/doMock/importActual paths. Idempotent: specifiers that already carry an
// extension are left alone. Prints anything it could not resolve.
//
// Usage: node scripts/add-js-extensions.mjs [dir-or-file ...]
// Defaults to every package's src/ and test/ plus the sample's generated
// migrations index. Run prettier afterwards: longer specifiers can re-wrap lines.
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultRoots = [
  ...readdirSync(join(repo, "packages")).flatMap((p) =>
    ["src", "test"].map((d) => join(repo, "packages", p, d)),
  ),
  join(repo, "samples/spfx-sample/src/migrations/index.ts"),
].filter((p) => existsSync(p));

const roots = process.argv.length > 2 ? process.argv.slice(2) : defaultRoots;

const SPEC =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bdeclare\s+module\s+|\bvi\.(?:mock|doMock|importActual)\s*(?:<[^>]*>)?\s*\(\s*)(["'])([^"'\n]+)\2/g;
const HAS_EXT = /\.(js|mjs|cjs|json|css|scss|svg|png)$/;

const unresolved = [];
let changedFiles = 0;
let changedSpecs = 0;

function walk(path) {
  if (statSync(path).isFile()) return fix(path);
  for (const name of readdirSync(path)) {
    if (name === "node_modules" || name === "dist") continue;
    walk(join(path, name));
  }
}

function relativeTarget(file, spec) {
  const base = resolve(dirname(file), spec);
  for (const ext of [".ts", ".tsx", ".d.ts"])
    if (existsSync(base + ext)) return spec + ".js";
  for (const ext of [".ts", ".tsx"])
    if (existsSync(join(base, "index" + ext)))
      return spec.replace(/\/?$/, "/index.js");
  return undefined;
}

/** `@scope/pkg/sub` or `pkg/sub` -> the file it names, when pkg has no `exports` map. */
function deepTarget(file, spec) {
  const m = /^((?:@[^/]+\/)?[^/@][^/]*)\/(.+)$/.exec(spec);
  if (!m) return null; // bare package root: resolved via main/exports, leave alone
  const [, pkgName] = m;
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const pkgDir = join(dir, "node_modules", pkgName);
    if (existsSync(join(pkgDir, "package.json"))) {
      const pkg = JSON.parse(
        readFileSync(join(pkgDir, "package.json"), "utf8"),
      );
      if (pkg.exports) return null; // exports map owns subpath resolution
      const base = join(dir, "node_modules", spec);
      if (existsSync(base + ".js")) return spec + ".js";
      if (existsSync(join(base, "index.js"))) return spec + "/index.js";
      return undefined;
    }
    if (dir === dirname(dir)) return null; // not installed: nothing to check against
  }
}

function target(file, spec) {
  if (HAS_EXT.test(spec) || spec.includes("${") || spec.startsWith("node:"))
    return null;
  const t = spec.startsWith(".")
    ? relativeTarget(file, spec)
    : deepTarget(file, spec);
  if (t === undefined) unresolved.push(`${file}: ${spec}`);
  return t ?? null;
}

function fix(file) {
  if (!/\.(ts|tsx|mts)$/.test(file)) return;
  const src = readFileSync(file, "utf8");
  let n = 0;
  const out = src.replace(SPEC, (match, pre, q, spec) => {
    const t = target(file, spec);
    if (!t) return match;
    n++;
    return `${pre}${q}${t}${q}`;
  });
  if (n) {
    writeFileSync(file, out);
    changedFiles++;
    changedSpecs += n;
  }
}

roots.forEach((r) => walk(resolve(r)));
console.log(`rewrote ${changedSpecs} specifiers in ${changedFiles} files`);
if (unresolved.length)
  console.log(`unresolved (left as-is):\n  ${unresolved.join("\n  ")}`);
