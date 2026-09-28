#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { loadConfig, loadModel } from "./config.js";
import { runAdd } from "./commands/add.js";
import { runList } from "./commands/list.js";
import { runRemove } from "./commands/remove.js";

export interface ParsedArgs {
  command: "add" | "list" | "remove";
  name?: string;
  config: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (command !== "add" && command !== "list" && command !== "remove") {
    throw new Error(
      `Unknown command '${command ?? ""}'. Use: add <Name> | list | remove.`,
    );
  }
  let config = "speel.migrations.config.ts";
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--config") {
      config = rest[++i] ?? config;
    } else positional.push(rest[i]!);
  }
  if (command === "add" && !positional[0])
    throw new Error(
      "`add` requires a migration name: speel-migrations add <Name>.",
    );
  return command === "add"
    ? { command, name: positional[0]!, config }
    : { command, config };
}

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const cfg = await loadConfig(args.config);
  const getModel = () => loadModel(cfg);
  if (args.command === "add") {
    const id = await runAdd(args.name!, cfg, getModel);
    process.stdout.write(`Created migration ${id}\n`);
  } else if (args.command === "list") {
    const { migrations, drift } = runList(cfg, getModel);
    process.stdout.write(
      `${migrations.length} migration(s):\n${migrations.map((m) => `  ${m}`).join("\n")}\n`,
    );
    process.stdout.write(
      drift
        ? "Model has un-generated changes (run `add`).\n"
        : "Snapshot is up to date.\n",
    );
  } else {
    const removed = await runRemove(cfg);
    process.stdout.write(
      removed ? `Removed migration ${removed}\n` : "No migrations to remove.\n",
    );
  }
}

// Entry point (ignored by unit tests, which import parseArgs/main directly).
// realpathSync resolves the .bin symlink so argv[1] matches import.meta.url (the module's realpath).
// The __ran guard is load-bearing: `index.ts` re-exports `main` from here, so when the
// config (loaded via jiti for decorator support) imports @speel/migrations-cli, jiti
// re-evaluates this module as a fresh instance whose entry guard would re-run main() and
// recurse infinitely. The global flag makes that re-evaluation a no-op.
const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : "";
const g = globalThis as { __speelMigrationsCliRan?: boolean };
if (
  import.meta.url === pathToFileURL(invokedPath).href &&
  !g.__speelMigrationsCliRan
) {
  g.__speelMigrationsCliRan = true;
  main(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}
