import { describe, it, expect } from "vitest";
import type { DbContext } from "@speel/core";
import { Migrator } from "../src/Migrator.js";
import { defineMigration } from "../src/defineMigration.js";
import { FakeSchemaProvider } from "../src/schema/FakeSchemaProvider.js";
import { listTitles } from "./schemaHelpers.js";
import { FakeHistoryStore } from "../src/history/IHistoryStore.js";

const ctx = {} as DbContext;

const m1 = defineMigration("20260101T0900_AddA", {
  up: (b) => {
    b.createList("A");
    b.addField("A", "Title", (f) => f.text({ required: true }));
  },
  down: (b) => b.dropList("A"),
});
const m2 = defineMigration("20260102T0900_AddB", {
  up: (b) => {
    b.createList("B");
    b.dropField("A", "Title");
    b.run("backfill B", async () => {});
  },
  down: (b) => b.dropList("B"),
});

const migrator = (applied: string[] = []): Migrator =>
  new Migrator({
    context: ctx,
    schema: new FakeSchemaProvider(),
    migrations: [m1, m2],
    history: new FakeHistoryStore(applied),
  });

describe("Migrator.plan", () => {
  it("plans every pending migration up, in id order, and writes nothing", async () => {
    const schema = new FakeSchemaProvider();
    const m = new Migrator({
      context: ctx,
      schema,
      migrations: [m2, m1],
      history: new FakeHistoryStore(),
    });
    const plan = await m.plan();

    expect(plan.direction).toBe("up");
    // AddB creates B without declaring a Title, so it trails a relax step.
    expect(plan.steps.map((s) => s.migrationId)).toEqual([
      "20260101T0900_AddA",
      "20260101T0900_AddA",
      "20260102T0900_AddB",
      "20260102T0900_AddB",
      "20260102T0900_AddB",
      "20260102T0900_AddB",
    ]);
    expect(plan.steps.every((s) => s.willRun)).toBe(true);
    expect(await listTitles(schema)).toEqual([]); // pure: no schema writes
  });

  it("summarizes each operation and flags destructive ones", async () => {
    const plan = await migrator().plan();
    const summaries = plan.steps.map((s) => s.summary);
    expect(summaries[0]).toBe('Create list "A"');
    expect(summaries[1]).toBe('Alter field Title (Text) on "A"');
    expect(summaries[3]).toBe('Drop field Title from "A"');
    expect(plan.steps.map((s) => s.destructive)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it("marks run steps opaque with their label and source", async () => {
    const plan = await migrator().plan();
    const runStep = plan.steps[5]!;
    expect(runStep.opaque).toBe(true);
    expect(runStep.label).toBe("backfill B");
    expect(runStep.summary).toBe("backfill B");
    expect(runStep.source).toContain("async");
    expect(plan.steps.filter((s) => s.opaque)).toHaveLength(1);
  });

  it("leaves presence unknown when not annotated", async () => {
    const plan = await migrator().plan();
    expect(plan.steps.every((s) => s.presence === "unknown")).toBe(true);
  });

  it("skips applied migrations", async () => {
    const plan = await migrator(["20260101T0900_AddA"]).plan();
    expect(new Set(plan.steps.map((s) => s.migrationId))).toEqual(
      new Set(["20260102T0900_AddB"]),
    );
  });

  it("plans one migration with only, reporting willRun false when it is already applied", async () => {
    const plan = await migrator(["20260101T0900_AddA"]).plan({
      only: "20260101T0900_AddA",
    });
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps.every((s) => s.willRun)).toBe(false);
    expect(plan.steps.every((s) => s.direction === "up")).toBe(true);
  });

  it("plans one pending migration with only, reporting willRun true", async () => {
    const plan = await migrator().plan({ only: "20260102T0900_AddB" });
    expect(plan.steps.every((s) => s.willRun)).toBe(true);
  });

  it("throws on an unknown only id", async () => {
    await expect(migrator().plan({ only: "nope" })).rejects.toThrow(
      "plan: unknown migration 'nope'",
    );
  });

  it("plans the down sequence for a target below the current state", async () => {
    const plan = await migrator([
      "20260101T0900_AddA",
      "20260102T0900_AddB",
    ]).plan({ to: "20260101T0900_AddA" });
    expect(plan.direction).toBe("down");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.summary).toBe(
      'Delete list "B" (to the site recycle bin)',
    );
    expect(plan.steps[0]!.direction).toBe("down");
    expect(plan.steps[0]!.destructive).toBe(true);
  });

  it("plans the up sequence for a target above the current state", async () => {
    const plan = await migrator(["20260101T0900_AddA"]).plan({
      to: "20260102T0900_AddB",
    });
    expect(plan.direction).toBe("up");
    expect(new Set(plan.steps.map((s) => s.migrationId))).toEqual(
      new Set(["20260102T0900_AddB"]),
    );
  });

  it("plans everything down for to: '0'", async () => {
    const plan = await migrator([
      "20260101T0900_AddA",
      "20260102T0900_AddB",
    ]).plan({ to: "0" });
    expect(plan.direction).toBe("down");
    expect(plan.steps.map((s) => s.migrationId)).toEqual([
      "20260102T0900_AddB",
      "20260101T0900_AddA",
    ]);
  });

  it("throws on an unknown to target", async () => {
    await expect(migrator().plan({ to: "nope" })).rejects.toThrow(
      "plan: unknown target 'nope'",
    );
  });
});
