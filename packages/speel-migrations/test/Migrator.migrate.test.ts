import { describe, it, expect } from "vitest";
import type { DbContext } from "@speel/core";
import { Migrator } from "../src/Migrator.js";
import { defineMigration } from "../src/defineMigration.js";
import { FakeSchemaProvider } from "../src/schema/FakeSchemaProvider.js";
import { FakeHistoryStore } from "../src/history/IHistoryStore.js";
import { listTitles } from "./schemaHelpers.js";

const ctx = {} as DbContext; // run() bodies below use state, not context

const m1 = defineMigration("20260101T0900_AddA", {
  up: (b) => {
    b.createList("A");
    b.addField("A", "Title", (f) => f.text({ required: true }));
  },
  down: (b) => b.dropList("A"),
});
const m2 = defineMigration("20260102T0900_AddB", {
  up: (b) => b.createList("B"),
  down: (b) => b.dropList("B"),
});

describe("Migrator.migrate (forward)", () => {
  it("applies all pending migrations in id order and records them", async () => {
    const schema = new FakeSchemaProvider();
    const history = new FakeHistoryStore();
    const migrator = new Migrator({
      context: ctx,
      schema,
      migrations: [m2, m1],
      history,
    });
    const res = await migrator.migrate();
    expect(res.ran).toEqual(["20260101T0900_AddA", "20260102T0900_AddB"]);
    expect(await listTitles(schema)).toEqual(["A", "B"]);
    expect((await history.applied()).sort()).toEqual([
      "20260101T0900_AddA",
      "20260102T0900_AddB",
    ]);
  });

  it("is idempotent — a second migrate runs nothing", async () => {
    const schema = new FakeSchemaProvider();
    const history = new FakeHistoryStore(["20260101T0900_AddA"]);
    const migrator = new Migrator({
      context: ctx,
      schema,
      migrations: [m1, m2],
      history,
    });
    const res = await migrator.migrate();
    expect(res.ran).toEqual(["20260102T0900_AddB"]); // only the pending one
  });

  it("run() steps execute positionally and share one state bag", async () => {
    const schema = new FakeSchemaProvider();
    const history = new FakeHistoryStore();
    const order: string[] = [];
    const mr = defineMigration("20260103T0900_Rebuild", {
      up: (b) => {
        b.run(async ({ state }) => {
          order.push("read");
          state.rows = [1, 2, 3];
        });
        b.dropList("A");
        b.createList("A");
        b.run(async ({ state }) => {
          order.push("write");
          order.push(`rows=${(state.rows as number[]).length}`);
        });
      },
      down: (b) => b.dropList("A"),
    });
    await new Migrator({
      context: ctx,
      schema,
      migrations: [mr],
      history,
    }).migrate();
    expect(order).toEqual(["read", "write", "rows=3"]);
  });

  it("status reports applied vs pending", async () => {
    const schema = new FakeSchemaProvider();
    const history = new FakeHistoryStore(["20260101T0900_AddA"]);
    const migrator = new Migrator({
      context: ctx,
      schema,
      migrations: [m1, m2],
      history,
    });
    expect(await migrator.status()).toEqual({
      applied: ["20260101T0900_AddA"],
      pending: ["20260102T0900_AddB"],
    });
  });
});
