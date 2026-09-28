// test/SharePointProvider.batch.test.ts
import { describe, it, expect } from "vitest";
import { textProperty } from "@speel/core/testing";
import { SharePointProvider } from "../src/SharePointProvider.js";

const TITLE = textProperty("Title");

function fakeSp() {
  const adds: {
    payload: Record<string, unknown>;
    id: number;
    resolve: (v: { data: { Id: number } }) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const updates: {
    id: number;
    payload: Record<string, unknown>;
    resolve: () => void;
    reject: (e: unknown) => void;
  }[] = [];
  const deletes: {
    id: number;
    resolve: () => void;
    reject: (e: unknown) => void;
  }[] = [];
  const recycles: {
    id: number;
    resolve: () => void;
    reject: (e: unknown) => void;
  }[] = [];
  let nextId = 100;

  const list = {
    items: {
      add: (payload: Record<string, unknown>) =>
        new Promise((resolve, reject) => {
          adds.push({
            payload,
            id: nextId++,
            resolve: resolve as never,
            reject,
          });
        }),
      getById: (id: number) => ({
        update: (payload: Record<string, unknown>, _etag: string) =>
          new Promise((resolve, reject) => {
            updates.push({ id, payload, resolve: resolve as never, reject });
          }),
        delete: (_etag: string) =>
          new Promise((resolve, reject) => {
            deletes.push({ id, resolve: resolve as never, reject });
          }),
        recycle: () =>
          new Promise((resolve, reject) => {
            recycles.push({ id, resolve: resolve as never, reject });
          }),
      }),
    },
  };

  const batchProps: unknown[] = [];
  const sp2 = {
    web: { lists: { getByTitle: () => list, getById: () => list } },
    batched(props?: unknown): readonly [any, () => Promise<unknown>] {
      batchProps.push(props);
      return [sp2, async () => execute()];
    },
  };

  async function execute() {
    for (const a of adds) a.resolve({ data: { Id: a.id } });
    for (const u of updates) u.resolve();
    for (const d of deletes) d.resolve();
    for (const r of recycles) r.resolve();
  }

  return { sp2, adds, updates, deletes, recycles, batchProps };
}

describe("SharePointProvider.executeBatchAsync", () => {
  it("opens batch scopes at the declared 100-request cap, not PnPjs's default 20", async () => {
    const { sp2, batchProps } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    await provider.executeBatchAsync([
      {
        kind: "insert",
        list: { kind: "title" as const, value: "Blogs" },
        fields: [{ property: TITLE, value: "A" }],
        folderServerRelativeUrl: null,
        clientToken: "t1",
      },
    ]);
    expect(batchProps).toEqual([{ maxRequests: 100 }]);
  });

  it("processes mixed insert/update/delete and reports per-op success", async () => {
    const { sp2, adds, updates, deletes } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    const list = { kind: "title" as const, value: "Blogs" };
    const res = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [{ property: TITLE, value: "A" }],
        folderServerRelativeUrl: null,
        clientToken: "t1",
      },
      {
        kind: "update",
        list,
        id: 5,
        fields: [{ property: TITLE, value: "B" }],
        etag: "*",
        clientToken: "t2",
      },
      {
        kind: "delete",
        list,
        id: 6,
        etag: "*",
        permanent: true,
        clientToken: "t3",
      },
    ]);
    expect(res).toHaveLength(3);
    const r1 = res.find((r) => r.clientToken === "t1")!;
    expect(r1.kind).toBe("success");
    if (r1.kind !== "success") throw new Error();
    expect(r1.serverData?.id).toBeGreaterThan(0);
    expect(adds.map((a) => a.payload)).toEqual([{ Title: "A" }]);
    expect(updates.map((u) => [u.id, u.payload])).toEqual([
      [5, { Title: "B" }],
    ]);
    expect(deletes.map((d) => d.id)).toEqual([6]);
  });

  it("routes a non-permanent delete through recycle() instead of delete()", async () => {
    const { sp2, deletes, recycles } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    const list = { kind: "title" as const, value: "Blogs" };
    const res = await provider.executeBatchAsync([
      {
        kind: "delete",
        list,
        id: 7,
        etag: "*",
        permanent: false,
        clientToken: "t1",
      },
    ]);
    expect(res[0]?.kind).toBe("success");
    expect(recycles.length).toBe(1);
    expect(deletes.length).toBe(0);
  });

  it("reports a failure when an individual op rejects", async () => {
    const list = {
      items: {
        add: () => Promise.reject({ status: 400, message: "bad" }),
        getById: (_id: number) => ({
          update: () => Promise.reject({ status: 500 }),
          delete: () => Promise.reject({ status: 500 }),
        }),
      },
    };
    const sp2: any = {
      web: { lists: { getByTitle: () => list, getById: () => list } },
      batched() {
        return [sp2, async () => undefined];
      },
    };
    const provider = new SharePointProvider(sp2);
    const res = await provider.executeBatchAsync([
      {
        kind: "insert",
        list: { kind: "title", value: "Blogs" },
        fields: [],
        folderServerRelativeUrl: null,
        clientToken: "fail",
      },
    ]);
    expect(res[0]?.kind).toBe("failure");
    if (res[0]?.kind !== "failure") throw new Error();
    expect(res[0].status).toBe(400);
  });
});
