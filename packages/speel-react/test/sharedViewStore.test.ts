import { describe, it, expect } from "vitest";
// A VALUE import on purpose: no package here type-checks .test.ts files, so a type-only
// import would be erased and this suite would pass without the module existing at all.
import { createEntitySharedViewStore } from "../src/table/views/sharedViewStore.js";
import type { SharedTableViewStore } from "../src/table/views/sharedViewStore.js";
import type { StoredView } from "../src/table/views/viewStore.js";

/** The contract a real store must satisfy; the entity-backed one is exercised via the hook. */
function fakeShared(canPublish: boolean): SharedTableViewStore {
  const rows = new Map<string, StoredView>();
  let n = 0;
  return {
    list: (tableId) =>
      Promise.resolve([...rows.values()].filter((v) => v.tableId === tableId)),
    save: (view) => {
      const id = view.id === "" ? `s${(n += 1)}` : view.id;
      const saved = { ...view, id };
      rows.set(id, saved);
      return Promise.resolve(saved);
    },
    remove: (id) => {
      rows.delete(id);
      return Promise.resolve();
    },
    canPublish: () => Promise.resolve(canPublish),
  };
}

describe("SharedTableViewStore contract", () => {
  it("is a TableViewStore plus a permission question", async () => {
    const store = fakeShared(true);
    const saved = await store.save({
      id: "",
      tableId: "t1",
      name: "Overdue",
      descriptor: { columns: [] },
    });
    expect(saved.id).not.toBe("");
    expect(await store.list("t1")).toHaveLength(1);
    expect(await store.canPublish()).toBe(true);
    await store.remove(saved.id);
    expect(await store.list("t1")).toEqual([]);
  });

  it("scopes by table, like the personal store", async () => {
    const store = fakeShared(false);
    await store.save({
      id: "",
      tableId: "t1",
      name: "A",
      descriptor: { columns: [] },
    });
    await store.save({
      id: "",
      tableId: "t2",
      name: "B",
      descriptor: { columns: [] },
    });
    expect(await store.list("t1")).toHaveLength(1);
    expect(await store.canPublish()).toBe(false);
  });
});

describe("createEntitySharedViewStore", () => {
  it("cannot publish unless the app says so", async () => {
    // speel has no effective-permissions API, so it cannot answer this itself. Defaulting to
    // false hides Publish rather than offering a button that 403s.
    const store = createEntitySharedViewStore({} as never);
    expect(await store.canPublish()).toBe(false);
  });

  it("asks the supplied predicate when there is one", async () => {
    const store = createEntitySharedViewStore({} as never, {
      canPublish: () => Promise.resolve(true),
    });
    expect(await store.canPublish()).toBe(true);
  });
});
