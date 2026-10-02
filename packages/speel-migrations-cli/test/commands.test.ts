import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedConfig } from "../src/config.js";
import { ModelBuilder, DbContext } from "@speel/core";
import type { Model } from "@speel/core";
import { runAdd } from "../src/commands/add.js";
import { runList } from "../src/commands/list.js";
import { runRemove } from "../src/commands/remove.js";

class Widget {
  Id?: number;
  Title?: string;
  Rank?: number;
}

function modelV1(): Model {
  const mb = new ModelBuilder();
  mb.entity(Widget, (b) => {
    b.toList("Widgets");
    b.property((e) => e.Title).isText();
  });
  return mb.build();
}
function modelV2(): Model {
  const mb = new ModelBuilder();
  mb.entity(Widget, (b) => {
    b.toList("Widgets");
    b.property((e) => e.Title).isText();
    b.property((e) => e.Rank).isNumber();
  });
  return mb.build();
}

const at = (y: number, mo: number, d: number, h: number, mi: number) => () =>
  new Date(Date.UTC(y, mo, d, h, mi));

let dir: string;
let cfg: ResolvedConfig;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "speelmig-"));
  const migrationsDir = join(dir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  cfg = {
    context: DbContext as never,
    migrationsDir,
    snapshot: join(migrationsDir, "model-snapshot.json"),
  };
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("runAdd", () => {
  it("generates a migration file, snapshot, and index for the first model", async () => {
    const id = await runAdd(
      "Initial",
      cfg,
      () => modelV1(),
      at(2026, 0, 1, 0, 0),
    );
    expect(id).toBe("20260101T0000_Initial");
    const files = readdirSync(cfg.migrationsDir).sort();
    expect(files).toContain("20260101T0000_Initial.ts");
    expect(files).toContain("index.ts");
    expect(files).toContain("model-snapshot.json");
    const src = readFileSync(
      join(cfg.migrationsDir, "20260101T0000_Initial.ts"),
      "utf8",
    );
    expect(src).toContain('b.createList("Widgets"');
    expect(readFileSync(join(cfg.migrationsDir, "index.ts"), "utf8")).toContain(
      "import m0 from './20260101T0000_Initial.js';",
    );
  });

  it("second add emits only the delta and appends to the index", async () => {
    await runAdd("Initial", cfg, () => modelV1(), at(2026, 0, 1, 0, 0));
    const id2 = await runAdd(
      "AddRank",
      cfg,
      () => modelV2(),
      at(2026, 0, 2, 0, 0),
    );
    const src = readFileSync(join(cfg.migrationsDir, `${id2}.ts`), "utf8");
    expect(src).toContain('b.addField("Widgets", "Rank"');
    expect(src).not.toContain("createList"); // Widgets already existed
    const index = readFileSync(join(cfg.migrationsDir, "index.ts"), "utf8");
    expect(index).toContain("import m1 from './20260102T0000_AddRank.js';");
    expect(index).toContain("export const migrations = [m0, m1];");
  });

  it("throws when the model has no changes", async () => {
    await runAdd("Initial", cfg, () => modelV1(), at(2026, 0, 1, 0, 0));
    await expect(
      runAdd("NoOp", cfg, () => modelV1(), at(2026, 0, 3, 0, 0)),
    ).rejects.toThrow(/no model changes/i);
  });
});

describe("runList", () => {
  it("lists local migrations and reports drift when the model is ahead of the snapshot", async () => {
    await runAdd("Initial", cfg, () => modelV1(), at(2026, 0, 1, 0, 0));
    const clean = runList(cfg, () => modelV1());
    expect(clean.migrations).toEqual(["20260101T0000_Initial"]);
    expect(clean.drift).toBe(false);
    const drifted = runList(cfg, () => modelV2());
    expect(drifted.drift).toBe(true);
  });
});

describe("runRemove", () => {
  it("deletes the latest migration and reverts the snapshot + index", async () => {
    await runAdd("Initial", cfg, () => modelV1(), at(2026, 0, 1, 0, 0));
    await runAdd("AddRank", cfg, () => modelV2(), at(2026, 0, 2, 0, 0));
    const removed = await runRemove(cfg);
    expect(removed).toBe("20260102T0000_AddRank");
    expect(
      existsSync(join(cfg.migrationsDir, "20260102T0000_AddRank.ts")),
    ).toBe(false);
    const snap = JSON.parse(readFileSync(cfg.snapshot, "utf8"));
    const widget = snap.entities.find(
      (e: { list: { title: string } }) => e.list.title === "Widgets",
    );
    expect(
      widget.fields.map((f: { internalName: string }) => f.internalName),
    ).not.toContain("Rank");
    const index = readFileSync(join(cfg.migrationsDir, "index.ts"), "utf8");
    expect(index).toContain("export const migrations = [m0];");
  });
});

describe("runAdd data-loss warnings", () => {
  class Setting {
    Id?: number;
    Title?: string;
    Value?: string;
  }
  const model = (multiline: boolean) => (): Model => {
    const mb = new ModelBuilder();
    mb.entity(Setting, (b) => {
      b.toList("Settings");
      b.property((e) => e.Title).isText();
      if (multiline) b.property((e) => e.Value).isNote();
      else b.property((e) => e.Value).isText();
    });
    return mb.build();
  };

  it("reports a generated step that may lose data, once per step", async () => {
    const quiet: string[] = [];
    await runAdd("Initial", cfg, model(false), at(2026, 0, 1, 0, 0), (m) =>
      quiet.push(m),
    );
    expect(quiet).toEqual([]);

    const warnings: string[] = [];
    const id = await runAdd(
      "WidenValue",
      cfg,
      model(true),
      at(2026, 0, 2, 0, 0),
      (m) => warnings.push(m),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(id);
    expect(warnings[0]).toContain("down");
    expect(warnings[0]).toMatch(/255 characters/);
    const src = readFileSync(join(cfg.migrationsDir, `${id}.ts`), "utf8");
    expect(src).toContain("// May lose data:");
  });
});
