import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig, loadModel } from "../src/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const configPath = join(here, "fixture", "speel.migrations.config.ts");

describe("config + model loading", () => {
  it("loads a TS config via jiti and resolves paths relative to the config file", async () => {
    const cfg = await loadConfig(configPath);
    expect(cfg.migrationsDir).toBe(join(here, "fixture", "migrations"));
    expect(cfg.snapshot).toBe(
      join(here, "fixture", "migrations", "model-snapshot.json"),
    );
  });

  it("builds the consumer Model from the context class (no live provider needed)", async () => {
    const cfg = await loadConfig(configPath);
    const model = loadModel(cfg);
    const titles = model.entityTypes
      .filter((e) => e.source.kind === "list")
      .map((e) => e.list.value);
    expect(titles).toContain("Widgets");
  });
});
