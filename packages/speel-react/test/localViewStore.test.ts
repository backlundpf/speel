import { describe, it, expect, beforeEach } from "vitest";
import { createLocalViewStore } from "../src/table/views/viewStore.js";
import type { StoredView } from "../src/table/views/viewStore.js";

const view = (over: Partial<StoredView> = {}): StoredView => ({
  id: "",
  tableId: "t1",
  name: "Mine",
  descriptor: { columns: [{ key: "Title" }] },
  ...over,
});

beforeEach(() => window.localStorage.clear());

describe("local view store", () => {
  it("assigns an id on create and returns the saved record", async () => {
    const store = createLocalViewStore();
    const saved = await store.save(view());
    expect(saved.id).not.toBe("");
    expect(await store.list("t1")).toEqual([saved]);
  });

  it("updates in place on a second save", async () => {
    const store = createLocalViewStore();
    const saved = await store.save(view());
    await store.save({ ...saved, name: "Renamed" });
    const all = await store.list("t1");
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe("Renamed");
  });

  it("scopes by tableId", async () => {
    const store = createLocalViewStore();
    await store.save(view());
    await store.save(view({ tableId: "t2", name: "Other" }));
    expect(await store.list("t1")).toHaveLength(1);
    expect(await store.list("t2")).toHaveLength(1);
  });

  it("removes", async () => {
    const store = createLocalViewStore();
    const saved = await store.save(view());
    await store.remove(saved.id);
    expect(await store.list("t1")).toEqual([]);
  });

  it("survives unreadable storage rather than throwing", async () => {
    window.localStorage.setItem("speel.tableViews", "{not json");
    expect(await createLocalViewStore().list("t1")).toEqual([]);
  });

  it("keeps ids unique across rapid creates", async () => {
    const store = createLocalViewStore();
    const a = await store.save(view({ name: "A" }));
    const b = await store.save(view({ name: "B" }));
    expect(a.id).not.toBe(b.id);
    expect(await store.list("t1")).toHaveLength(2);
  });
});
