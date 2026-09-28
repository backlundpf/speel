import { describe, it, expect } from "vitest";
import { DbContext } from "@speel/core";
import { SharePointHistoryStore } from "../src/history/SharePointHistoryStore.js";
import { FakeSchemaProvider } from "../src/schema/FakeSchemaProvider.js";
import { emptySnapshot } from "../src/schema/SchemaSnapshot.js";
import { makeFakeDataProvider } from "./fakeDataProvider.js";
import { fieldNames, listExists } from "./schemaHelpers.js";

class EmptyContext extends DbContext {
  protected override onModelCreating(): void {}
}

describe("SharePointHistoryStore", () => {
  it("bootstraps the history list when absent", async () => {
    const schema = new FakeSchemaProvider();
    const ctx = new EmptyContext({ provider: makeFakeDataProvider() });
    const store = new SharePointHistoryStore(ctx, schema);
    await store.bootstrap(emptySnapshot());
    expect(await listExists(schema, "SpeelMigrationsHistory")).toBe(true);
    expect(await fieldNames(schema, "SpeelMigrationsHistory")).toEqual([
      "AppliedUtc",
    ]);
  });

  it("creates the list and its column in separate waves", async () => {
    const schema = new FakeSchemaProvider();
    const ctx = new EmptyContext({ provider: makeFakeDataProvider() });
    await new SharePointHistoryStore(ctx, schema).bootstrap(emptySnapshot());
    // A field cannot reference a list created in the same changeset.
    expect(schema.applyCalls).toHaveLength(2);
    expect(schema.applyCalls[0]?.[0]?.op).toBe("createList");
    expect(schema.applyCalls[1]?.[0]?.op).toBe("addField");
  });

  it("does nothing when the snapshot already has the list", async () => {
    const schema = new FakeSchemaProvider();
    const ctx = new EmptyContext({ provider: makeFakeDataProvider() });
    const snapshot = emptySnapshot();
    snapshot.lists.set("SpeelMigrationsHistory", {
      id: "existing-guid",
      title: "SpeelMigrationsHistory",
      fields: new Map(),
    });
    await new SharePointHistoryStore(ctx, schema).bootstrap(snapshot);
    expect(schema.applyCalls).toHaveLength(0);
  });

  it("records, lists, and unrecords applied migration ids", async () => {
    const schema = new FakeSchemaProvider();
    const provider = makeFakeDataProvider();
    const store = new SharePointHistoryStore(
      new EmptyContext({ provider }),
      schema,
    );
    await store.bootstrap(emptySnapshot());
    await store.record("20260101T0900_A");
    await store.record("20260102T0900_B");
    expect((await store.applied()).sort()).toEqual([
      "20260101T0900_A",
      "20260102T0900_B",
    ]);
    await store.unrecord("20260101T0900_A");
    expect(await store.applied()).toEqual(["20260102T0900_B"]);
  });

  it("bootstraps a custom list title when one is supplied", async () => {
    const schema = new FakeSchemaProvider();
    const ctx = new EmptyContext({ provider: makeFakeDataProvider() });
    const store = new SharePointHistoryStore(ctx, schema, "_MigrationsHistory");
    await store.bootstrap(emptySnapshot());
    expect(await listExists(schema, "_MigrationsHistory")).toBe(true);
    expect(await fieldNames(schema, "_MigrationsHistory")).toEqual([
      "AppliedUtc",
    ]);
    expect(await listExists(schema, "SpeelMigrationsHistory")).toBe(false);
  });

  it("reads rows from the custom list, not the default one", async () => {
    // Seeded under the custom title only: a store still reading the default
    // would come back empty. MigrationId maps to the Title column.
    const provider = makeFakeDataProvider({
      _MigrationsHistory: [{ ID: 1, Id: 1, Title: "20260101T0900_A" }],
    });
    const store = new SharePointHistoryStore(
      new EmptyContext({ provider }),
      new FakeSchemaProvider(),
      "_MigrationsHistory",
    );
    expect(await store.applied()).toEqual(["20260101T0900_A"]);
  });
});
