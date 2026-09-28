import "fake-indexeddb/auto"; // installs indexedDB + IDBKeyRange globals for Node
import { describe, it, expect } from "vitest";
import { IndexedDbCacheProvider } from "../../../src/Cache/IndexedDbCacheProvider.js";

const LK = "title:Projects";
function freshProvider() {
  // Unique db name per test for isolation against the shared global factory.
  return new IndexedDbCacheProvider({
    dbName: `t-${Math.random().toString(36).slice(2)}`,
  });
}

describe("IndexedDbCacheProvider", () => {
  it("read returns null for an unknown list", async () => {
    const p = freshProvider();
    expect(await p.read(LK)).toBeNull();
  });

  it("replaceAll then read returns records and state", async () => {
    const p = freshProvider();
    await p.replaceAll(
      LK,
      [
        { ID: 1, Title: "A" },
        { ID: 2, Title: "B" },
      ],
      { token: "t1", lastSyncedAt: 100, stale: false },
    );
    const entry = await p.read(LK);
    expect(entry!.state).toEqual({
      token: "t1",
      lastSyncedAt: 100,
      stale: false,
    });
    expect(entry!.records.map((r) => r.ID).sort()).toEqual([1, 2]);
  });

  it("replaceAll replaces (does not merge) prior records", async () => {
    const p = freshProvider();
    await p.replaceAll(LK, [{ ID: 1 }, { ID: 2 }], { token: "t1" });
    await p.replaceAll(LK, [{ ID: 3 }], { token: "t2" });
    const entry = await p.read(LK);
    expect(entry!.records.map((r) => r.ID)).toEqual([3]);
  });

  it("applyDelta upserts by Id and removes deleted Ids", async () => {
    const p = freshProvider();
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

  it("markStale sets the flag without dropping records", async () => {
    const p = freshProvider();
    await p.replaceAll(LK, [{ ID: 1 }], { token: "t1", stale: false });
    await p.markStale(LK);
    const entry = await p.read(LK);
    expect(entry!.state.stale).toBe(true);
    expect(entry!.records).toHaveLength(1);
  });

  it("does not leak records across lists", async () => {
    const p = freshProvider();
    await p.replaceAll(LK, [{ ID: 1 }], { token: "t1" });
    await p.replaceAll("title:Other", [{ ID: 9 }], { token: "t9" });
    expect((await p.read(LK))!.records.map((r) => r.ID)).toEqual([1]);
    expect((await p.read("title:Other"))!.records.map((r) => r.ID)).toEqual([
      9,
    ]);
  });

  it("persists across a reopen with the same dbName", async () => {
    const dbName = `t-${Math.random().toString(36).slice(2)}`;
    const p1 = new IndexedDbCacheProvider({ dbName });
    await p1.replaceAll(LK, [{ ID: 1, Title: "A" }], { token: "t1" });
    const p2 = new IndexedDbCacheProvider({ dbName });
    expect((await p2.read(LK))!.records[0]!.Title).toBe("A");
  });

  it("clear(listKey) removes one list", async () => {
    const p = freshProvider();
    await p.replaceAll(LK, [{ ID: 1 }], {});
    await p.clear(LK);
    expect(await p.read(LK)).toBeNull();
  });

  it("stores typed values as they are: a Date survives the structured clone as a Date", async () => {
    const p = freshProvider();
    const when = new Date("2026-01-02T03:04:05Z");
    await p.replaceAll(LK, [{ ID: 1, When: when, Multi: [1, 2] }], {});
    const [rec] = (await p.read(LK))!.records;
    expect(rec!.When).toBeInstanceOf(Date);
    expect((rec!.When as Date).getTime()).toBe(when.getTime());
    expect(rec!.Multi).toEqual([1, 2]);
  });

  it("opening over a v1 database drops its records: they hold wire shapes Materialize no longer coerces", async () => {
    const dbName = `t-${Math.random().toString(36).slice(2)}`;
    // A database as the pre-typed-boundary provider left it: version 1, both
    // stores, one list synced with a token.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("records");
        req.result.createObjectStore("meta");
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["records", "meta"], "readwrite");
        tx.objectStore("records").put(
          { ID: 1, When: "2026-01-02T03:04:05Z" },
          `${LK}|1`,
        );
        tx.objectStore("meta").put({ token: "old" }, LK);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const p = new IndexedDbCacheProvider({ dbName });
    // Nothing cached: the next cacheAsync syncs from an empty token and refills.
    expect(await p.read(LK)).toBeNull();
    // And the upgraded database is fully usable.
    await p.replaceAll(LK, [{ ID: 2 }], { token: "t2" });
    expect((await p.read(LK))!.records.map((r) => r.ID)).toEqual([2]);
  });

  it("an older tab holding the database open is closed out when a newer version opens, so the upgrade runs instead of blocking", async () => {
    const dbName = `t-${Math.random().toString(36).slice(2)}`;
    // This provider is "the older tab": its connection stays open after a read.
    const older = new IndexedDbCacheProvider({ dbName });
    await older.replaceAll(LK, [{ ID: 1 }], { token: "t1" });
    // Learn the version it holds, without pinning DB_VERSION here.
    const current = await new Promise<number>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => {
        const v = req.result.version;
        req.result.close();
        resolve(v);
      };
      req.onerror = () => reject(req.error);
    });
    // "The newer tab": opens one version up. Per spec the older connection gets
    // `versionchange`; if it stays open, `blocked` fires and this open waits
    // forever. Killing line: `db.onversionchange = () => db.close()` in open().
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName, current + 1);
      req.onblocked = () =>
        reject(new Error("upgrade blocked by the older connection"));
      req.onupgradeneeded = () => {
        /* schema of the future — nothing to do */
      };
      req.onsuccess = () => {
        expect(req.result.version).toBe(current + 1);
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  });
});
