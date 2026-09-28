import { rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedConfig } from "../config.js";
import { renderIndex } from "../id.js";
import { migrationIds } from "./add.js";

/** `speel-migrations remove` — delete the latest migration and restore the snapshot it was generated against. */
export async function runRemove(cfg: ResolvedConfig): Promise<string | null> {
  const ids = migrationIds(cfg.migrationsDir);
  const latest = ids[ids.length - 1];
  if (!latest) return null;

  const prevPath = join(cfg.migrationsDir, `${latest}.prev-snapshot.json`);
  if (existsSync(prevPath)) {
    writeFileSync(cfg.snapshot, readFileSync(prevPath, "utf8"), "utf8");
    rmSync(prevPath, { force: true });
  }
  rmSync(join(cfg.migrationsDir, `${latest}.ts`), { force: true });
  writeFileSync(
    join(cfg.migrationsDir, "index.ts"),
    renderIndex(ids.slice(0, -1)),
    "utf8",
  );
  return latest;
}
