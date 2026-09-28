import { describe, it, expect } from "vitest";
import { DbContext } from "@speel/core";
import { Migrator } from "../src/Migrator.js";
import { defineMigration } from "../src/defineMigration.js";
import { FakeSchemaProvider } from "../src/schema/FakeSchemaProvider.js";
import { listExists } from "./schemaHelpers.js";
import { makeFakeDataProvider } from "./fakeDataProvider.js";

class EmptyContext extends DbContext {
  protected override onModelCreating(): void {}
}

const baseline = defineMigration("20260101T0900_Baseline", {
  up: (b) => {
    b.createList("Projects");
  },
  down: (b) => b.dropList("Projects"),
});

/** `historyList` renames the bookkeeping list only — it never touches the model's own lists. */
describe("Migrator historyList", () => {
  it("defaults to SpeelMigrationsHistory", async () => {
    const schema = new FakeSchemaProvider();
    const context = new EmptyContext({ provider: makeFakeDataProvider() });
    await new Migrator({ context, schema, migrations: [baseline] }).status();
    expect(await listExists(schema, "SpeelMigrationsHistory")).toBe(true);
  });

  it("bootstraps the supplied title instead", async () => {
    const schema = new FakeSchemaProvider();
    const context = new EmptyContext({ provider: makeFakeDataProvider() });
    await new Migrator({
      context,
      schema,
      migrations: [baseline],
      historyList: "_MigrationsHistory",
    }).status();
    expect(await listExists(schema, "_MigrationsHistory")).toBe(true);
    expect(await listExists(schema, "SpeelMigrationsHistory")).toBe(false);
  });

  it("is ignored when an explicit history store is supplied", async () => {
    const schema = new FakeSchemaProvider();
    const context = new EmptyContext({ provider: makeFakeDataProvider() });
    const { FakeHistoryStore } =
      await import("../src/history/IHistoryStore.js");
    await new Migrator({
      context,
      schema,
      migrations: [baseline],
      historyList: "_MigrationsHistory",
      history: new FakeHistoryStore(),
    }).status();
    expect(await listExists(schema, "_MigrationsHistory")).toBe(false);
  });
});
