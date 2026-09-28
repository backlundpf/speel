import { describe, it, expect } from "vitest";
import type { DbContext } from "@speel/core";
import { Migrator } from "../src/Migrator.js";
import { defineMigration } from "../src/defineMigration.js";
import { FakeSchemaProvider } from "../src/schema/FakeSchemaProvider.js";
import { FakeHistoryStore } from "../src/history/IHistoryStore.js";
import { MigrationApplyError } from "../src/MigrationApplyError.js";

const ctx = {} as DbContext;

/** Shaped like a typical app baseline: every list created, then every field. */
const baselineShaped = defineMigration("20260101T0900_Baseline", {
  up: (b) => {
    b.createList("Alpha");
    b.createList("Beta");
    b.addField("Alpha", "Done", (f) => f.boolean());
    b.addField("Alpha", "Archived", (f) => f.boolean());
    b.addField("Beta", "Active", (f) => f.boolean());
  },
  down: (b) => {
    b.dropList("Alpha");
    b.dropList("Beta");
  },
});

describe("Migrator batching", () => {
  it("applies a baseline-shaped migration in exactly two batches", async () => {
    const schema = new FakeSchemaProvider();
    const migrator = new Migrator({
      context: ctx,
      schema,
      migrations: [baselineShaped],
      history: new FakeHistoryStore(),
    });
    await migrator.migrate();

    expect(schema.applyCalls).toHaveLength(2);
    expect(schema.applyCalls[0]?.map((o) => o.op)).toEqual([
      "createList",
      "createList",
    ]);
    // The two trailing alterFields relax the built-in Title of each new list;
    // riding the field wave is what keeps this at two batches.
    expect(schema.applyCalls[1]?.map((o) => o.op)).toEqual([
      "addField",
      "addField",
      "addField",
      "alterField",
      "alterField",
    ]);
  });

  it("re-sends only the Title relax when the schema is already in place", async () => {
    const schema = new FakeSchemaProvider();
    await new Migrator({
      context: ctx,
      schema,
      migrations: [baselineShaped],
      history: new FakeHistoryStore(),
    }).migrate();
    const callsAfterFirst = schema.applyCalls.length;

    // Same live schema, fresh history — every op is already satisfied.
    const again = await new Migrator({
      context: ctx,
      schema,
      migrations: [baselineShaped],
      history: new FakeHistoryStore(),
    }).migrate();

    // Every authored op is satisfied and skipped. The Title relax is an
    // alterField, which is never "satisfied" — a snapshot cannot prove a MERGE
    // already landed — so it goes out again as one more batch.
    expect(again.log.filter((l) => l.startsWith("skip "))).toHaveLength(5);
    expect(schema.applyCalls).toHaveLength(callsAfterFirst + 1);
    expect(schema.applyCalls.at(-1)?.map((o) => o.op)).toEqual([
      "alterField",
      "alterField",
    ]);
  });

  it("throws MigrationApplyError naming every failure in the wave", async () => {
    const schema = new FakeSchemaProvider();
    schema.failOn = (op) => (op.op === "addField" ? "bad spec" : undefined);
    const migrator = new Migrator({
      context: ctx,
      schema,
      migrations: [baselineShaped],
      history: new FakeHistoryStore(),
    });

    await expect(migrator.migrate()).rejects.toBeInstanceOf(
      MigrationApplyError,
    );
    // All three field adds went out together — the first failure did not stop the rest.
    expect(
      schema.applyCalls[1]?.filter((o) => o.op === "addField"),
    ).toHaveLength(3);
  });

  it("carries every failure on the thrown error", async () => {
    const schema = new FakeSchemaProvider();
    schema.failOn = (op) => (op.op === "addField" ? "bad spec" : undefined);
    const migrator = new Migrator({
      context: ctx,
      schema,
      migrations: [baselineShaped],
      history: new FakeHistoryStore(),
    });

    const err = await migrator.migrate().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MigrationApplyError);
    const applyError = err as MigrationApplyError;
    expect(applyError.migrationId).toBe("20260101T0900_Baseline");
    expect(applyError.failures).toHaveLength(3);
    expect(applyError.message).toContain("3 operation(s) failed");
    expect(applyError.message).toContain("bad spec");
  });

  it("does not record a migration whose wave failed", async () => {
    const schema = new FakeSchemaProvider();
    schema.failOn = (op) => (op.op === "addField" ? "nope" : undefined);
    const history = new FakeHistoryStore();
    const migrator = new Migrator({
      context: ctx,
      schema,
      migrations: [baselineShaped],
      history,
    });

    await expect(migrator.migrate()).rejects.toThrow();
    expect(await history.applied()).toEqual([]);
  });

  it("stops before the wave that depended on the failed one", async () => {
    const schema = new FakeSchemaProvider();
    schema.failOn = (op) => (op.op === "createList" ? "denied" : undefined);
    const migrator = new Migrator({
      context: ctx,
      schema,
      migrations: [baselineShaped],
      history: new FakeHistoryStore(),
    });

    await expect(migrator.migrate()).rejects.toThrow();
    expect(schema.applyCalls).toHaveLength(1);
  });

  it("commits schema before a run op fires", async () => {
    const schema = new FakeSchemaProvider();
    const seen: string[] = [];
    const withRun = defineMigration("20260102T0900_Run", {
      up: (b) => {
        b.createList("Gamma");
        b.run("observe", async () => {
          seen.push(...(await schema.readSchemaAsync()).lists.keys());
        });
        b.addField("Gamma", "Done", (f) => f.boolean());
      },
      down: () => {},
    });

    await new Migrator({
      context: ctx,
      schema,
      migrations: [withRun],
      history: new FakeHistoryStore(),
    }).migrate();

    expect(seen).toContain("Gamma");
  });

  it("batches a lookup separately from the list it points at", async () => {
    const schema = new FakeSchemaProvider();
    const withLookup = defineMigration("20260103T0900_Lookup", {
      up: (b) => {
        b.createList("Owners");
        b.addField("Tasks", "Owner", (f) => f.lookup({ list: "Owners" }));
      },
      down: () => {},
    });

    await new Migrator({
      context: ctx,
      schema,
      migrations: [withLookup],
      history: new FakeHistoryStore(),
    }).migrate();

    expect(schema.applyCalls).toHaveLength(2);
    // The lookup wave can see the guid the create wave produced.
    const snap = await schema.readSchemaAsync();
    expect(snap.lists.get("Owners")?.id).toBe("fake-guid-Owners");
  });
});
