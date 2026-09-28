import { describe, it, expect, beforeEach } from "vitest";
import { createLocalUserSettingsStore } from "@speel/identity";
import { createSettingsViewStore } from "../src/table/views/settingsViewStore.js";
import type { StoredView } from "../src/table/views/viewStore.js";

const view = (over: Partial<StoredView> = {}): StoredView => ({
  id: "",
  tableId: "t1",
  name: "Mine",
  descriptor: { columns: [{ key: "Title" }] },
  ...over,
});

beforeEach(() => window.localStorage.clear());

describe("settings-backed view store", () => {
  it("saves each view under its own key, so two views never share a row", async () => {
    const settings = createLocalUserSettingsStore();
    const store = createSettingsViewStore(settings);
    const a = await store.save(view({ name: "A" }));
    const b = await store.save(view({ name: "B" }));
    const keys = Object.keys(await settings.getAll());
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => k.startsWith("table.view.t1."))).toBe(true);
    expect(a.id).not.toBe(b.id);
  });

  it("lists only the requested table", async () => {
    const settings = createLocalUserSettingsStore();
    const store = createSettingsViewStore(settings);
    await store.save(view());
    await store.save(view({ tableId: "t2", name: "Other" }));
    expect(await store.list("t1")).toHaveLength(1);
    expect((await store.list("t2"))[0]!.name).toBe("Other");
  });

  it("updates in place rather than adding a second row", async () => {
    const settings = createLocalUserSettingsStore();
    const store = createSettingsViewStore(settings);
    const saved = await store.save(view());
    await store.save({ ...saved, name: "Renamed" });
    const all = await store.list("t1");
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe("Renamed");
  });

  it("removes one view without disturbing its neighbours", async () => {
    const settings = createLocalUserSettingsStore();
    const store = createSettingsViewStore(settings);
    const a = await store.save(view({ name: "A" }));
    await store.save(view({ name: "B" }));
    await store.remove(a.id);
    const left = await store.list("t1");
    expect(left).toHaveLength(1);
    expect(left[0]!.name).toBe("B");
  });

  it("round-trips the descriptor, since that is the part with structure", async () => {
    const settings = createLocalUserSettingsStore();
    const store = createSettingsViewStore(settings);
    const saved = await store.save(
      view({
        descriptor: {
          columns: [
            { key: "Title", width: 200 },
            { key: "Status", hidden: true },
          ],
          sort: { key: "Title", direction: "desc" },
          pageSize: 25,
        },
      }),
    );
    const [back] = await store.list("t1");
    expect(back!.descriptor).toEqual(saved.descriptor);
  });
});
