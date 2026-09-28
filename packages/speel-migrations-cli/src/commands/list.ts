import type { Model } from "@speel/core";
import type { ResolvedConfig } from "../config.js";
import { projectModel } from "../snapshot.js";
import { diffSnapshots } from "../diff.js";
import { readSnapshot, migrationIds } from "./add.js";

export interface ListResult {
  migrations: string[];
  drift: boolean;
}

/** `speel-migrations list` — local migrations + whether the model is ahead of the snapshot. */
export function runList(
  cfg: ResolvedConfig,
  getModel: () => Model,
): ListResult {
  const migrations = migrationIds(cfg.migrationsDir);
  const diff = diffSnapshots(
    readSnapshot(cfg.snapshot),
    projectModel(getModel()),
  );
  return { migrations, drift: diff.up.length > 0 };
}
