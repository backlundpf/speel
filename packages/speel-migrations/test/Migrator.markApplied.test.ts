import { describe, it, expect } from "vitest";
import type { DbContext } from "@speel/core";
import { Migrator } from "../src/Migrator.js";
import { defineMigration } from "../src/defineMigration.js";
import { FakeSchemaProvider } from "../src/schema/FakeSchemaProvider.js";
import { listTitles } from "./schemaHelpers.js";
import { FakeHistoryStore } from "../src/history/IHistoryStore.js";

const ctx = {} as DbContext;
const baseline = defineMigration("20260101T0900_Baseline", {
  up: (b) => {
    b.createList("Projects");
  },
  down: (b) => b.dropList("Projects"),
});

describe("Migrator.markApplied", () => {
  it("records the migration without running its operations", async () => {
    const schema = new FakeSchemaProvider();
    const history = new FakeHistoryStore();
    const m = new Migrator({
      context: ctx,
      schema,
      migrations: [baseline],
      history,
    });

    await m.markApplied("20260101T0900_Baseline");

    expect(await history.applied()).toEqual(["20260101T0900_Baseline"]);
    expect(await listTitles(schema)).toEqual([]); // nothing was created
    expect((await m.status()).pending).toEqual([]);
  });

  it("is idempotent", async () => {
    const history = new FakeHistoryStore(["20260101T0900_Baseline"]);
    const m = new Migrator({
      context: ctx,
      schema: new FakeSchemaProvider(),
      migrations: [baseline],
      history,
    });
    await m.markApplied("20260101T0900_Baseline");
    expect(await history.applied()).toEqual(["20260101T0900_Baseline"]);
  });

  it("throws on an unknown id", async () => {
    const m = new Migrator({
      context: ctx,
      schema: new FakeSchemaProvider(),
      migrations: [baseline],
      history: new FakeHistoryStore(),
    });
    await expect(m.markApplied("nope")).rejects.toThrow(
      "markApplied: unknown migration 'nope'",
    );
  });
});
