import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Model } from "@speel/core";
import type { ResolvedConfig } from "../config.js";
import { projectModel, type SnapshotDoc } from "../snapshot.js";
import { diffSnapshots } from "../diff.js";
import { renderMigrationFile } from "../emit.js";
import { nextMigrationId, renderIndex } from "../id.js";

const EMPTY: SnapshotDoc = { version: 1, entities: [] };

export function readSnapshot(path: string): SnapshotDoc {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as SnapshotDoc)
    : EMPTY;
}

export function migrationIds(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((f) => f.slice(0, -3))
    .sort();
}

/** `speel-migrations add <Name>` — diff model vs snapshot, write migration + snapshot + index. */
export async function runAdd(
  name: string,
  cfg: ResolvedConfig,
  getModel: () => Model,
  clock: () => Date = () => new Date(),
): Promise<string> {
  const prev = readSnapshot(cfg.snapshot);
  const next = projectModel(getModel());
  const diff = diffSnapshots(prev, next);
  if (diff.up.length === 0)
    throw new Error("No model changes to generate a migration for.");

  const id = nextMigrationId(name, clock());
  writeFileSync(
    join(cfg.migrationsDir, `${id}.ts`),
    renderMigrationFile(id, diff),
    "utf8",
  );
  // Persist the pre-migration snapshot so `remove` can restore it deterministically.
  writeFileSync(
    join(cfg.migrationsDir, `${id}.prev-snapshot.json`),
    JSON.stringify(prev, null, 2) + "\n",
    "utf8",
  );
  writeFileSync(cfg.snapshot, JSON.stringify(next, null, 2) + "\n", "utf8");
  writeFileSync(
    join(cfg.migrationsDir, "index.ts"),
    renderIndex(migrationIds(cfg.migrationsDir)),
    "utf8",
  );
  return id;
}
