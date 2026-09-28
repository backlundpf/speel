// @vitest-environment jsdom
// The local store is the one browser-bound thing in this package; everything else runs
// under node, so the environment is set per-file rather than for the whole suite.
import { describe, it, expect, beforeEach } from "vitest";
import { createLocalUserSettingsStore } from "../src/userSettingsStore.js";

beforeEach(() => window.localStorage.clear());

describe("local user settings store", () => {
  it("round-trips values of any shape", async () => {
    const store = createLocalUserSettingsStore();
    await store.set("theme.dark", true);
    await store.set("table.view.t1.v1", {
      name: "Mine",
      descriptor: { columns: [] },
    });
    const all = await store.getAll();
    expect(all["theme.dark"]).toBe(true);
    expect(all["table.view.t1.v1"]).toEqual({
      name: "Mine",
      descriptor: { columns: [] },
    });
  });

  it("overwrites a key rather than accumulating", async () => {
    const store = createLocalUserSettingsStore();
    await store.set("theme.dark", true);
    await store.set("theme.dark", false);
    expect((await store.getAll())["theme.dark"]).toBe(false);
  });

  it("removes", async () => {
    const store = createLocalUserSettingsStore();
    await store.set("a", 1);
    await store.remove("a");
    expect(await store.getAll()).toEqual({});
  });

  it("survives unreadable storage rather than throwing", async () => {
    window.localStorage.setItem("speel.userSettings", "{not json");
    expect(await createLocalUserSettingsStore().getAll()).toEqual({});
  });

  it("keeps other keys when one is removed", async () => {
    const store = createLocalUserSettingsStore();
    await store.set("a", 1);
    await store.set("b", 2);
    await store.remove("a");
    expect(await store.getAll()).toEqual({ b: 2 });
  });
});
