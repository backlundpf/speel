import { describe, it, expect, vi, afterEach } from "vitest";
import type { DbContext } from "@speel/core";
import { Migrator } from "../src/Migrator.js";
import { defineMigration } from "../src/defineMigration.js";
import { FakeSchemaProvider } from "../src/schema/FakeSchemaProvider.js";
import { FakeHistoryStore } from "../src/history/IHistoryStore.js";
import type { MigrationEvent } from "../src/progress.js";
import { seed, createList, addField } from "./schemaHelpers.js";

const ctx = {} as DbContext;

const narrow = defineMigration("20260201T0900_NarrowValue", {
  up: (b) => b.alterField("Config", "Value", (f) => f.text()),
  down: (b) => b.alterField("Config", "Value", (f) => f.note()),
});

async function setup(): Promise<{
  migrator: Migrator;
  history: FakeHistoryStore;
}> {
  const schema = new FakeSchemaProvider();
  await seed(
    schema,
    createList("Config"),
    addField("Config", {
      kind: "Text",
      internalName: "Value",
      multiline: true,
    }),
  );
  const history = new FakeHistoryStore();
  return {
    migrator: new Migrator({
      context: ctx,
      schema,
      migrations: [narrow],
      history,
    }),
    history,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Migrator data-loss warnings", () => {
  it("flags a narrowing alterField in the plan", async () => {
    const { migrator } = await setup();
    const plan = await migrator.plan();
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.warning).toMatch(/255 characters/);
  });

  it("warns at apply time on the step's events, the log and the console — and still runs it", async () => {
    const { migrator } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const events: MigrationEvent[] = [];
    const result = await migrator.migrate({
      onProgress: (e) => events.push(e),
    });

    const steps = events.filter(
      (e) => e.kind === "step-start" || e.kind === "step-done",
    );
    expect(steps).toHaveLength(2);
    for (const e of steps) {
      expect((e as { warning?: string }).warning).toMatch(/255 characters/);
    }
    expect(steps[1]).toMatchObject({ kind: "step-done", status: "applied" });
    expect(result.ran).toEqual(["20260201T0900_NarrowValue"]);
    expect(
      result.log.some((l) =>
        l.startsWith(
          'warn 20260201T0900_NarrowValue Alter field Value (Text) on "Config"',
        ),
      ),
    ).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/255 characters/);
  });

  it("says nothing for a widening (the rollback here)", async () => {
    const { migrator } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await migrator.migrate();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const events: MigrationEvent[] = [];
    await migrator.migrateTo("0", { onProgress: (e) => events.push(e) });
    expect(events.some((e) => "warning" in e)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
