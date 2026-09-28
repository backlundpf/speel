import { describe, it, expect, vi } from "vitest";
import type { DbContext } from "@speel/core";
import { Migrator } from "../src/Migrator.js";
import { defineMigration } from "../src/defineMigration.js";
import { FakeSchemaProvider } from "../src/schema/FakeSchemaProvider.js";
import { FakeHistoryStore } from "../src/history/IHistoryStore.js";
import { addField, createList, seed } from "./schemaHelpers.js";

const ctx = {} as DbContext;

const baseline = defineMigration("20260101T0900_Baseline", {
  up: (b) => {
    b.createList("Projects");
    b.addField("Projects", "DueDate", (f) => f.dateTime());
    b.addField("Projects", "Budget", (f) => f.number());
    b.addIndex("Projects", "DueDate");
    b.run("seed lookups", async () => {});
  },
  down: (b) => b.dropList("Projects"),
});

describe("Migrator.plan annotation", () => {
  it("reports present for a schema that already matches, absent for what is missing", async () => {
    const schema = new FakeSchemaProvider();
    await seed(
      schema,
      createList("Projects"),
      addField("Projects", {
        kind: "DateTime",
        internalName: "DueDate",
        displayFormat: "DateOnly",
        friendlyFormat: "Disabled",
      }),
    );

    const m = new Migrator({
      context: ctx,
      schema,
      migrations: [baseline],
      history: new FakeHistoryStore(),
    });
    const plan = await m.plan({ annotate: true });

    expect(plan.steps.map((s) => s.presence)).toEqual([
      "present", // createList Projects
      "present", // addField DueDate
      "absent", // addField Budget
      "absent", // addIndex DueDate — readable now: the column exists, unindexed
      "absent", // alterField Title — the relax on a list declaring no Title
      "unknown", // run step
    ]);
  });

  it("reports present for an index that already exists", async () => {
    const schema = new FakeSchemaProvider();
    await seed(
      schema,
      createList("Projects"),
      addField("Projects", {
        kind: "DateTime",
        internalName: "DueDate",
        displayFormat: "DateOnly",
        friendlyFormat: "Disabled",
        indexed: true,
      }),
    );

    const plan = await new Migrator({
      context: ctx,
      schema,
      migrations: [baseline],
      history: new FakeHistoryStore(),
    }).plan({ annotate: true });

    expect(plan.steps[3]?.presence).toBe("present");
  });

  it("reports absent for fields whose list does not exist yet", async () => {
    const m = new Migrator({
      context: ctx,
      schema: new FakeSchemaProvider(),
      migrations: [baseline],
      history: new FakeHistoryStore(),
    });
    const plan = await m.plan({ annotate: true });
    expect(plan.steps.slice(0, 3).map((s) => s.presence)).toEqual([
      "absent",
      "absent",
      "absent",
    ]);
  });

  it("leaves presence unknown when annotate is off", async () => {
    const m = new Migrator({
      context: ctx,
      schema: new FakeSchemaProvider(),
      migrations: [baseline],
      history: new FakeHistoryStore(),
    });
    const plan = await m.plan();
    expect(plan.steps.every((s) => s.presence === "unknown")).toBe(true);
  });

  it("reads the schema exactly once, annotated or not", async () => {
    const schema = new FakeSchemaProvider();
    await seed(schema, createList("Projects"));
    const read = vi.spyOn(schema, "readSchemaAsync");

    const migrator = () =>
      new Migrator({
        context: ctx,
        schema,
        migrations: [baseline],
        history: new FakeHistoryStore(),
      });

    await migrator().plan({ annotate: true });
    expect(read).toHaveBeenCalledTimes(1);

    read.mockClear();
    await migrator().plan();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("annotates every op against one read, however many target the same list", async () => {
    const schema = new FakeSchemaProvider();
    await seed(schema, createList("Projects"));
    const read = vi.spyOn(schema, "readSchemaAsync");

    const wide = defineMigration("20260102T0900_Wide", {
      up: (b) => {
        for (const n of ["A", "B", "C", "D", "E"]) {
          b.addField("Projects", n, (f) => f.number());
        }
      },
      down: () => {},
    });

    const plan = await new Migrator({
      context: ctx,
      schema,
      migrations: [wide],
      history: new FakeHistoryStore(),
    }).plan({ annotate: true });

    expect(plan.steps).toHaveLength(5);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
