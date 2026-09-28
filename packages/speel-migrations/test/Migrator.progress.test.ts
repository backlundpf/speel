import { describe, it, expect } from "vitest";
import type { DbContext } from "@speel/core";
import { Migrator } from "../src/Migrator.js";
import { defineMigration } from "../src/defineMigration.js";
import { FakeSchemaProvider } from "../src/schema/FakeSchemaProvider.js";
import { FakeHistoryStore } from "../src/history/IHistoryStore.js";
import { MigrationApplyError } from "../src/MigrationApplyError.js";
import type { MigrationEvent } from "../src/progress.js";
import { seed, createList } from "./schemaHelpers.js";

const ctx = {} as DbContext;

const first = defineMigration("20260101T0900_First", {
  up: (b) => {
    b.createList("Alpha");
    b.addField("Alpha", "Done", (f) => f.boolean());
  },
  down: (b) => b.dropList("Alpha"),
});

const second = defineMigration("20260102T0900_Second", {
  up: (b) => b.createList("Beta"),
  down: (b) => b.dropList("Beta"),
});

function collector(): {
  events: MigrationEvent[];
  onProgress: (e: MigrationEvent) => void;
} {
  const events: MigrationEvent[] = [];
  return { events, onProgress: (e) => events.push(e) };
}

/** `kind:summary-or-id` per event — the whole stream in one readable array. */
const trace = (events: readonly MigrationEvent[]): string[] =>
  events.map((e) =>
    e.kind === "migration-start" || e.kind === "migration-done"
      ? `${e.kind}:${e.migrationId}`
      : e.kind === "step-done"
        ? `step-done:${e.status}:${e.summary}`
        : `${e.kind}:${e.summary}`,
  );

describe("Migrator progress", () => {
  it("brackets every migration and reports each step start and finish", async () => {
    const schema = new FakeSchemaProvider();
    const { events, onProgress } = collector();
    await new Migrator({
      context: ctx,
      schema,
      migrations: [first],
      history: new FakeHistoryStore(),
    }).migrate({ onProgress });

    expect(trace(events)).toEqual([
      "migration-start:20260101T0900_First",
      'step-start:Create list "Alpha"',
      'step-done:applied:Create list "Alpha"',
      'step-start:Add field Done (Boolean) to "Alpha"',
      'step-start:Alter field Title (Text) on "Alpha"',
      'step-done:applied:Add field Done (Boolean) to "Alpha"',
      'step-done:applied:Alter field Title (Text) on "Alpha"',
      "migration-done:20260101T0900_First",
    ]);
    // Every event in a run carries the migration it belongs to, so a consumer can
    // group the stream without tracking the brackets itself.
    expect(events.every((e) => e.migrationId === "20260101T0900_First")).toBe(
      true,
    );
  });

  it("starts a whole wave before its results land — that is what names the step in flight", async () => {
    const schema = new FakeSchemaProvider();
    const { events, onProgress } = collector();
    await new Migrator({
      context: ctx,
      schema,
      migrations: [first],
      history: new FakeHistoryStore(),
    }).migrate({ onProgress });

    const kinds = events.map((e) => e.kind);
    const firstDone = kinds.indexOf("step-done");
    // The createList wave resolves before the field wave is announced.
    expect(kinds.slice(0, firstDone + 1)).toEqual([
      "migration-start",
      "step-start",
      "step-done",
    ]);
  });

  it("reports a satisfied op as skipped, with no start of its own", async () => {
    const schema = new FakeSchemaProvider();
    await seed(schema, createList("Alpha"));
    const { events, onProgress } = collector();
    await new Migrator({
      context: ctx,
      schema,
      migrations: [first],
      history: new FakeHistoryStore(),
    }).migrate({ onProgress });

    expect(trace(events)).toContain('step-done:skipped:Create list "Alpha"');
    expect(trace(events)).not.toContain('step-start:Create list "Alpha"');
  });

  it("reports a failed op and stops, leaving no migration-done behind", async () => {
    const schema = new FakeSchemaProvider();
    schema.failOn = (op) =>
      op.op === "createList" ? "the server said no" : undefined;
    const { events, onProgress } = collector();
    const migrator = new Migrator({
      context: ctx,
      schema,
      migrations: [first],
      history: new FakeHistoryStore(),
    });

    await expect(migrator.migrate({ onProgress })).rejects.toBeInstanceOf(
      MigrationApplyError,
    );
    expect(trace(events)).toEqual([
      "migration-start:20260101T0900_First",
      'step-start:Create list "Alpha"',
      'step-done:failed:Create list "Alpha"',
    ]);
    const failed = events.find(
      (e) => e.kind === "step-done" && e.status === "failed",
    );
    expect(failed).toMatchObject({ error: "the server said no" });
  });

  it("brackets a custom run step so a hanging data step is visible", async () => {
    const schema = new FakeSchemaProvider();
    const withRun = defineMigration("20260103T0900_Data", {
      up: (b) => {
        b.createList("Gamma");
        b.run("Backfill the codes", async () => undefined);
      },
      down: (b) => b.dropList("Gamma"),
    });
    const { events, onProgress } = collector();
    await new Migrator({
      context: ctx,
      schema,
      migrations: [withRun],
      history: new FakeHistoryStore(),
    }).migrate({ onProgress });

    expect(trace(events)).toContain("step-start:Backfill the codes");
    expect(trace(events)).toContain("step-done:applied:Backfill the codes");
  });

  it("reports a throwing run step as failed before the error propagates", async () => {
    const schema = new FakeSchemaProvider();
    const boom = defineMigration("20260104T0900_Boom", {
      up: (b) =>
        b.run("Backfill the codes", async () => {
          throw new Error("no data source");
        }),
      down: () => undefined,
    });
    const { events, onProgress } = collector();
    const migrator = new Migrator({
      context: ctx,
      schema,
      migrations: [boom],
      history: new FakeHistoryStore(),
    });

    await expect(migrator.migrate({ onProgress })).rejects.toThrow(
      "no data source",
    );
    expect(trace(events)).toEqual([
      "migration-start:20260104T0900_Boom",
      "step-start:Backfill the codes",
      "step-done:failed:Backfill the codes",
    ]);
  });

  it("streams each pending migration in turn", async () => {
    const schema = new FakeSchemaProvider();
    const { events, onProgress } = collector();
    await new Migrator({
      context: ctx,
      schema,
      migrations: [first, second],
      history: new FakeHistoryStore(),
    }).migrate({ onProgress });

    expect(trace(events).filter((t) => t.startsWith("migration-"))).toEqual([
      "migration-start:20260101T0900_First",
      "migration-done:20260101T0900_First",
      "migration-start:20260102T0900_Second",
      "migration-done:20260102T0900_Second",
    ]);
  });

  it("reports direction on a down run, and migrateTo streams too", async () => {
    const schema = new FakeSchemaProvider();
    const history = new FakeHistoryStore();
    const migrator = new Migrator({
      context: ctx,
      schema,
      migrations: [first, second],
      history,
    });
    await migrator.migrate();

    const { events, onProgress } = collector();
    await migrator.migrateTo("20260101T0900_First", { onProgress });

    expect(events[0]).toMatchObject({
      kind: "migration-start",
      migrationId: "20260102T0900_Second",
      direction: "down",
    });
    expect(trace(events)).toContain(
      'step-start:Delete list "Beta" (to the site recycle bin)',
    );
  });

  it("runs unobserved when no callback is supplied", async () => {
    const schema = new FakeSchemaProvider();
    const result = await new Migrator({
      context: ctx,
      schema,
      migrations: [first],
      history: new FakeHistoryStore(),
    }).migrate();
    expect(result.ran).toEqual(["20260101T0900_First"]);
  });
});
