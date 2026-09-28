import { describe, it, expect } from "vitest";
import type { DbContext } from "@speel/core";
import { Migrator } from "../src/Migrator.js";
import { defineMigration } from "../src/defineMigration.js";
import { FakeSchemaProvider } from "../src/schema/FakeSchemaProvider.js";
import { FakeHistoryStore } from "../src/history/IHistoryStore.js";
import { createList, listTitles, seed } from "./schemaHelpers.js";

const ctx = {} as DbContext;
const a = defineMigration("20260101T0900_A", {
  up: (b) => b.createList("A"),
  down: (b) => b.dropList("A"),
});
const bb = defineMigration("20260102T0900_B", {
  up: (b) => b.createList("B"),
  down: (b) => b.dropList("B"),
});
const c = defineMigration("20260103T0900_C", {
  up: (b) => b.createList("C"),
  down: (b) => b.dropList("C"),
});
const migrations = [a, bb, c];

async function seeded(...titles: string[]): Promise<FakeSchemaProvider> {
  const schema = new FakeSchemaProvider();
  await seed(schema, ...titles.map(createList));
  return schema;
}

describe("Migrator.migrateTo (reversible)", () => {
  it("applies up through the target", async () => {
    const schema = new FakeSchemaProvider();
    const history = new FakeHistoryStore();
    const res = await new Migrator({
      context: ctx,
      schema,
      migrations,
      history,
    }).migrateTo("20260102T0900_B");
    expect(res).toMatchObject({
      direction: "up",
      ran: ["20260101T0900_A", "20260102T0900_B"],
    });
    expect(await listTitles(schema)).toEqual(["A", "B"]);
  });

  it("rolls back down to the target in reverse, removing history rows", async () => {
    const schema = await seeded("A", "B", "C");
    const history = new FakeHistoryStore([
      "20260101T0900_A",
      "20260102T0900_B",
      "20260103T0900_C",
    ]);
    const res = await new Migrator({
      context: ctx,
      schema,
      migrations,
      history,
    }).migrateTo("20260101T0900_A");
    expect(res).toMatchObject({
      direction: "down",
      ran: ["20260103T0900_C", "20260102T0900_B"],
    });
    expect(await listTitles(schema)).toEqual(["A"]);
    expect(await history.applied()).toEqual(["20260101T0900_A"]);
  });

  it("migrateTo('0') rolls everything back", async () => {
    const schema = await seeded("A", "B");
    const history = new FakeHistoryStore([
      "20260101T0900_A",
      "20260102T0900_B",
    ]);
    const res = await new Migrator({
      context: ctx,
      schema,
      migrations,
      history,
    }).migrateTo("0");
    expect(res.direction).toBe("down");
    expect(await listTitles(schema)).toEqual([]);
    expect(await history.applied()).toEqual([]);
  });

  it("throws on an unknown target id", async () => {
    const migrator = new Migrator({
      context: ctx,
      schema: new FakeSchemaProvider(),
      migrations,
      history: new FakeHistoryStore(),
    });
    await expect(migrator.migrateTo("nope")).rejects.toThrow(/unknown target/i);
  });
});
