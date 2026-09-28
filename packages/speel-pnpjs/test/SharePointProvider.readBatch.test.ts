// test/SharePointProvider.readBatch.test.ts
//
// executeReadBatchAsync collapses one include level into a single $batch, and keeps
// the contract's completeness promise: a filtered read whose first page might have a
// successor is re-fetched in full on the paged path rather than reported short.
import { describe, it, expect } from "vitest";
import { SharePointProvider } from "../src/SharePointProvider.js";
import type { IListHandle, IReadOperation } from "@speel/core";

const blogs: IListHandle = { kind: "title", value: "Blogs" };
const comments: IListHandle = { kind: "title", value: "Comments" };

interface IFakeOpts {
  /** Items by list title, for the filtered-collection reads. */
  collections?: Record<string, Record<string, unknown>[]>;
  /** Items by id, for the point lookups. */
  records?: Record<number, Record<string, unknown>>;
  /** Envelope key the fake reports its continuation link under (default: none). */
  nextLinkKey?: "odata.nextLink" | "@odata.nextLink" | "none";
}

function fakeSpfi(opts: IFakeOpts) {
  const records = opts.records ?? {};
  const collections = opts.collections ?? {};
  const execCalls: number[] = [];
  const pointReads: number[] = [];
  /** Every collection read: which list, whether it went through JSONParse, its $top. */
  const collectionReads: {
    title: string;
    jsonParsed: boolean;
    top: number;
    filter?: string;
  }[] = [];
  /** Reads that went through the paged-iterator path instead of a batched invoke. */
  const pagedDrains: string[] = [];
  let batchCounter = 0;

  const buildItem = (id: number) => {
    const item: any = async () => {
      if (!(id in records)) {
        const err = new Error("not found") as Error & { status: number };
        err.status = 404;
        throw err;
      }
      pointReads.push(id);
      return records[id]!;
    };
    item.select = () => item;
    item.expand = () => item;
    return item;
  };

  const buildItems = (title: string) => {
    const state = {
      jsonParsed: false,
      top: 0,
      filter: undefined as string | undefined,
    };
    const q: any = async () => {
      collectionReads.push({
        title,
        jsonParsed: state.jsonParsed,
        top: state.top,
        filter: state.filter,
      });
      const all = collections[title] ?? [];
      const page = all.slice(0, state.top);
      if (!state.jsonParsed) return page; // DefaultParse: bare rows
      const body: Record<string, unknown> = { value: page };
      if (
        opts.nextLinkKey &&
        opts.nextLinkKey !== "none" &&
        all.length > state.top
      ) {
        body[opts.nextLinkKey] = "https://example/next";
      }
      return body;
    };
    q.select = () => q;
    q.expand = () => q;
    q.filter = (f: string) => {
      state.filter = f;
      return q;
    };
    q.orderBy = () => q;
    q.skip = () => q;
    q.top = (n: number) => {
      state.top = n;
      return q;
    };
    q.using = () => {
      state.jsonParsed = true;
      return q;
    };
    q.getById = (id: number) => buildItem(id);
    // The paged-drain fallback iterates the collection; hand back everything at once.
    q[Symbol.asyncIterator] = () => {
      pagedDrains.push(title);
      let done = false;
      return {
        next: async () => {
          if (done) return { done: true, value: undefined };
          done = true;
          return { done: false, value: collections[title] ?? [] };
        },
      };
    };
    return q;
  };

  const listFor = (title: string) => ({ items: buildItems(title) });

  const sp: any = {
    web: {
      lists: {
        getByTitle: (title: string) => listFor(title),
        getById: (title: string) => listFor(title),
      },
      siteUserInfoList: { items: { getById: (id: number) => buildItem(id) } },
    },
    batched: () => {
      batchCounter++;
      return [
        sp,
        async () => {
          execCalls.push(batchCounter);
        },
      ] as const;
    },
  };

  return { sp, execCalls, pointReads, collectionReads, pagedDrains };
}

const levelOps: readonly IReadOperation[] = [
  {
    kind: "items",
    source: comments,
    fields: ["Id", "Body"],
    pageSize: 1000,
    options: {
      filter: { kind: "in", column: "BlogId", values: [1, 2], negate: false },
    },
    clientToken: "a",
  },
  {
    kind: "itemsByIds",
    source: blogs,
    ids: [1],
    fields: ["Id", "Title"],
    clientToken: "b",
  },
];

describe("SharePointProvider.executeReadBatchAsync", () => {
  it("runs a whole level — a filtered read and a point lookup — in ONE $batch", async () => {
    const { sp, execCalls, collectionReads, pointReads } = fakeSpfi({
      collections: { Comments: [{ ID: 10, Body: "C1" }] },
      records: { 1: { ID: 1, Title: "Blog 1" } },
    });
    const provider = new SharePointProvider(sp);

    const results = await provider.executeReadBatchAsync(levelOps);

    expect(execCalls.length).toBe(1);
    expect(results.map((r) => r.clientToken)).toEqual(["a", "b"]);
    expect(results[0]!.items).toEqual([{ ID: 10, Body: "C1" }]);
    expect(results[1]!.items).toEqual([{ ID: 1, Title: "Blog 1" }]);
    // The collection read went through JSONParse — that is what keeps the envelope,
    // and the envelope is the only place completeness is knowable.
    expect(collectionReads[0]!.jsonParsed).toBe(true);
    expect(collectionReads[0]!.top).toBe(1000);
    expect(pointReads).toEqual([1]);
  });

  it("returns [] for a point lookup that 404s, without failing the level", async () => {
    const { sp } = fakeSpfi({ collections: { Comments: [] }, records: {} });
    const provider = new SharePointProvider(sp);

    const results = await provider.executeReadBatchAsync(levelOps);

    expect(results[1]!.items).toEqual([]);
  });

  it("splits into multiple $batches at the 100-sub-request cap", async () => {
    const records: Record<number, Record<string, unknown>> = {};
    for (let i = 1; i <= 250; i++) records[i] = { ID: i, Title: `T${i}` };
    const { sp, execCalls } = fakeSpfi({ records });
    const provider = new SharePointProvider(sp);

    const results = await provider.executeReadBatchAsync([
      {
        kind: "itemsByIds",
        source: blogs,
        ids: Array.from({ length: 250 }, (_, i) => i + 1),
        fields: ["Id", "Title"],
        clientToken: "a",
      },
    ]);

    expect(execCalls.length).toBe(3); // 100 + 100 + 50
    expect(results[0]!.items.length).toBe(250);
  });

  it("drains a spilled read in full rather than reporting one page", async () => {
    const all = Array.from({ length: 5 }, (_, i) => ({
      ID: i + 1,
      Body: `C${i + 1}`,
    }));
    const { sp, pagedDrains } = fakeSpfi({
      collections: { Comments: all },
      nextLinkKey: "odata.nextLink",
    });
    const provider = new SharePointProvider(sp);

    const results = await provider.executeReadBatchAsync([
      {
        kind: "items",
        source: comments,
        fields: ["Id", "Body"],
        pageSize: 2,
        clientToken: "a",
      },
    ]);

    // The batched first page saw 2 of 5 and a continuation link, so the read was
    // re-fetched whole on the paged path.
    expect(results[0]!.items.length).toBe(5);
    expect(pagedDrains).toEqual(["Comments"]);
  });

  it("drains a full page whose envelope exposes no continuation link it can read", async () => {
    // The conservative branch: exactly $top rows back and no link under any key we
    // know. Reporting that as complete would silently truncate, so it re-fetches.
    const all = Array.from({ length: 4 }, (_, i) => ({
      ID: i + 1,
      Body: `C${i + 1}`,
    }));
    const { sp, pagedDrains } = fakeSpfi({
      collections: { Comments: all },
      nextLinkKey: "none",
    });
    const provider = new SharePointProvider(sp);

    const results = await provider.executeReadBatchAsync([
      {
        kind: "items",
        source: comments,
        fields: ["Id", "Body"],
        pageSize: 4,
        clientToken: "a",
      },
    ]);

    expect(results[0]!.items.length).toBe(4);
    expect(pagedDrains).toEqual(["Comments"]);
  });

  it("trusts a short page — no continuation is possible, so no extra round-trip", async () => {
    const { sp, pagedDrains } = fakeSpfi({
      collections: { Comments: [{ ID: 1, Body: "C1" }] },
      nextLinkKey: "none",
    });
    const provider = new SharePointProvider(sp);

    const results = await provider.executeReadBatchAsync([
      {
        kind: "items",
        source: comments,
        fields: ["Id", "Body"],
        pageSize: 1000,
        clientToken: "a",
      },
    ]);

    expect(results[0]!.items.length).toBe(1);
    expect(pagedDrains).toEqual([]);
  });

  it("tags a failure with the operation that caused it", async () => {
    const { sp } = fakeSpfi({ collections: {}, records: {} });
    sp.web.siteUserInfoList.items.getById = () => {
      const q: any = async () => {
        throw new Error("boom");
      };
      q.select = () => q;
      return q;
    };
    const provider = new SharePointProvider(sp);

    await expect(
      provider.executeReadBatchAsync([
        {
          kind: "itemsByIds",
          source: { kind: "provider", key: "principals" },
          ids: [7],
          fields: ["Id", "Title"],
          clientToken: "u",
        },
      ]),
    ).rejects.toMatchObject({ clientToken: "u" });
  });

  it("makes no request for an empty operation list", async () => {
    const { sp, execCalls } = fakeSpfi({});
    const provider = new SharePointProvider(sp);

    expect(await provider.executeReadBatchAsync([])).toEqual([]);
    expect(execCalls.length).toBe(0);
  });
});
