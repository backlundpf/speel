import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Runs the BUILT binary under plain Node, outside vitest's resolver, which tolerates
// module specifiers that Node's ESM loader rejects. Requires `npm run build` first
// (the root `verify` script builds before it tests).
const bin = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const config = fileURLToPath(
  new URL("./smoke-fixture/speel.migrations.config.ts", import.meta.url),
);

describe("speel-migrations binary", () => {
  it("runs `list` under plain Node against a consumer config", () => {
    const out = execFileSync(
      process.execPath,
      [bin, "list", "--config", config],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(out).toContain("0 migration(s)");
    expect(out).toContain("Model has un-generated changes");
  }, 30_000);
});
