import { describe, it, expect } from "vitest";
import { InMemoryCacheProvider } from "../../../src/Cache/InMemoryCacheProvider.js";

const LK = "title:Projects";

describe("InMemoryCacheProvider", () => {
  it("read returns null for an unknown list", async () => {
    const p = new InMemoryCacheProvider();
    expect(await p.read(LK)).toBeNull();
  });

  it("replaceAll then read returns records and state", async () => {
    const p = new InMemoryCacheProvider();
    await p.replaceAll(
      LK,
      [
        { ID: 1, Title: "A" },
        { ID: 2, Title: "B" },
      ],
      { token: "t1", lastSyncedAt: 100, stale: false },
    );
    const entry = await p.read(LK);
    expect(entry).not.toBeNull();
    expect(entry!.state).toEqual({
      token: "t1",
      lastSyncedAt: 100,
      stale: false,
    });
    expect(entry!.records.map((r) => r.ID).sort()).toEqual([1, 2]);
  });

  it("applyDelta upserts by Id and removes deleted Ids", async () => {
    const p = new InMemoryCacheProvider();
    await p.replaceAll(
      LK,
      [
        { ID: 1, Title: "A" },
        { ID: 2, Title: "B" },
      ],
      { token: "t1" },
    );
    await p.applyDelta(
      LK,
      [
        { ID: 2, Title: "B2" },
        { ID: 3, Title: "C" },
      ],
      [1],
      { token: "t2" },
    );
    const entry = await p.read(LK);
    const byId = new Map(entry!.records.map((r) => [r.ID, r.Title]));
    expect([...byId.keys()].sort()).toEqual([2, 3]);
    expect(byId.get(2)).toBe("B2");
    expect(entry!.state.token).toBe("t2");
  });

  it("markStale flips the flag without dropping records", async () => {
    const p = new InMemoryCacheProvider();
    await p.replaceAll(LK, [{ ID: 1 }], { token: "t1", stale: false });
    await p.markStale(LK);
    const entry = await p.read(LK);
    expect(entry!.state.stale).toBe(true);
    expect(entry!.records).toHaveLength(1);
  });

  it("clear(listKey) removes one list; clear() removes all", async () => {
    const p = new InMemoryCacheProvider();
    await p.replaceAll(LK, [{ ID: 1 }], {});
    await p.replaceAll("title:Other", [{ ID: 9 }], {});
    await p.clear(LK);
    expect(await p.read(LK)).toBeNull();
    expect(await p.read("title:Other")).not.toBeNull();
    await p.clear();
    expect(await p.read("title:Other")).toBeNull();
  });

  it("returned records are copies (mutating them does not corrupt the cache)", async () => {
    const p = new InMemoryCacheProvider();
    await p.replaceAll(LK, [{ ID: 1, Title: "A" }], {});
    const first = await p.read(LK);
    (first!.records[0] as Record<string, unknown>).Title = "mutated";
    const second = await p.read(LK);
    expect(second!.records[0]!.Title).toBe("A");
  });
});

describe("InMemoryCacheProvider isolates its rows", () => {
  it("a row read back shares no Date or array with the store, nor with a second read", async () => {
    const cache = new InMemoryCacheProvider();
    const when = new Date("2026-01-02T03:04:05Z");
    const row = { ID: 1, PublishedAt: when, Tags: ["a"] };
    await cache.replaceAll("k", [row], { token: "t" });
    row.Tags.push("mutated-after-write"); // the caller's array is not the store's
    const first = (await cache.read("k"))!.records[0]!;
    const second = (await cache.read("k"))!.records[0]!;
    (first.Tags as string[]).push("b");
    (first.PublishedAt as Date).setUTCFullYear(1999);
    expect(second.Tags).toEqual(["a"]);
    expect((second.PublishedAt as Date).toISOString()).toBe(
      "2026-01-02T03:04:05.000Z",
    );
    expect(first.PublishedAt).not.toBe(when);
  });

  it("applyDelta isolates upserts the same way", async () => {
    const cache = new InMemoryCacheProvider();
    const up = { ID: 2, Tags: ["x"] };
    await cache.applyDelta("k", [up], [], { token: "t2" });
    up.Tags.push("later");
    expect((await cache.read("k"))!.records[0]!.Tags).toEqual(["x"]);
  });
});
