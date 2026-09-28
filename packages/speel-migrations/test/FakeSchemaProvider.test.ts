import { describe, it, expect } from "vitest";
import { FakeSchemaProvider } from "../src/schema/FakeSchemaProvider.js";
import type { SchemaOperation } from "../src/operations/operations.js";

const createList = (title: string): SchemaOperation => ({
  op: "createList",
  title,
  spec: { title, template: "genericList" },
});
const addBool = (list: string, name: string): SchemaOperation => ({
  op: "addField",
  list,
  field: { kind: "Boolean", internalName: name },
});

describe("FakeSchemaProvider", () => {
  it("starts empty and records applied ops into its snapshot", async () => {
    const s = new FakeSchemaProvider();
    expect((await s.readSchemaAsync()).lists.size).toBe(0);

    await s.applyAsync([createList("A")], await s.readSchemaAsync());
    const after = await s.readSchemaAsync();
    expect(after.lists.get("A")?.id).toBe("fake-guid-A");
  });

  it("reports applied status and assigns list ids", async () => {
    const s = new FakeSchemaProvider();
    const results = await s.applyAsync(
      [createList("A")],
      await s.readSchemaAsync(),
    );
    expect(results).toEqual([
      { op: createList("A"), status: "applied", listId: "fake-guid-A" },
    ]);
  });

  it("records one applyCalls entry per call, preserving op order", async () => {
    const s = new FakeSchemaProvider();
    await s.applyAsync(
      [createList("A"), createList("B")],
      await s.readSchemaAsync(),
    );
    await s.applyAsync([addBool("A", "Done")], await s.readSchemaAsync());
    expect(s.applyCalls).toHaveLength(2);
    expect(s.applyCalls[0]).toHaveLength(2);
    expect(s.applyCalls[1]).toEqual([addBool("A", "Done")]);
  });

  it("fails the ops failOn selects, leaving the rest applied", async () => {
    const s = new FakeSchemaProvider();
    s.failOn = (op) => (op.op === "addField" ? "bad spec" : undefined);
    await s.applyAsync([createList("A")], await s.readSchemaAsync());
    const results = await s.applyAsync(
      [addBool("A", "Done"), addBool("A", "Other")],
      await s.readSchemaAsync(),
    );
    expect(results.map((r) => r.status)).toEqual(["failed", "failed"]);
    expect(results[0]?.error?.message).toBe("bad spec");
    expect((await s.readSchemaAsync()).lists.get("A")?.fields.size).toBe(0);
  });

  it("round-trips a field's required and indexed flags", async () => {
    const s = new FakeSchemaProvider();
    await s.applyAsync([createList("A")], await s.readSchemaAsync());
    await s.applyAsync(
      [
        {
          op: "addField",
          list: "A",
          field: {
            kind: "Boolean",
            internalName: "Flag",
            required: true,
            indexed: true,
          },
        },
      ],
      await s.readSchemaAsync(),
    );
    expect(
      (await s.readSchemaAsync()).lists.get("A")?.fields.get("Flag"),
    ).toEqual({
      internalName: "Flag",
      typeAsString: "Boolean",
      required: true,
      indexed: true,
    });
  });

  it("hands out snapshots that do not alias its internal state", async () => {
    const s = new FakeSchemaProvider();
    await s.applyAsync([createList("A")], await s.readSchemaAsync());
    const snap = await s.readSchemaAsync();
    snap.lists.delete("A");
    expect((await s.readSchemaAsync()).lists.has("A")).toBe(true);
  });

  it("renames and drops lists through the shared fold helper", async () => {
    const s = new FakeSchemaProvider();
    await s.applyAsync(
      [createList("A"), createList("B")],
      await s.readSchemaAsync(),
    );
    await s.applyAsync(
      [
        { op: "renameList", from: "A", to: "Renamed" },
        { op: "dropList", title: "B" },
      ],
      await s.readSchemaAsync(),
    );
    const snap = await s.readSchemaAsync();
    expect([...snap.lists.keys()]).toEqual(["Renamed"]);
  });
});
