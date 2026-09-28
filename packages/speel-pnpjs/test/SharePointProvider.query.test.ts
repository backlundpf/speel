// test/SharePointProvider.query.test.ts
import { describe, it, expect } from "vitest";
import { SharePointProvider } from "../src/SharePointProvider.js";
import type { FilterNode } from "@speel/core";
import { ModelBuilder, SpeelEntity, DbSet, ChangeTracker } from "@speel/core";

function fakeListWithSpies(opts?: { itemCount?: number }) {
  const calls = {
    filter: undefined as string | undefined,
    orderBy: [] as Array<{ column: string; ascending: boolean }>,
    skip: undefined as number | undefined,
    top: undefined as number | undefined,
    iteratorCalls: 0,
    listSelectField: undefined as string | undefined,
    select: [] as string[],
    expand: [] as string[],
  };
  const items: Record<string, unknown>[] = [
    { ID: 1, Title: "A" },
    { ID: 2, Title: "B" },
  ];

  const builder: any = {
    select: (...cols: string[]) => {
      calls.select = cols;
      return builder;
    },
    expand: (...navs: string[]) => {
      calls.expand = navs;
      return builder;
    },
    filter: (s: string) => {
      calls.filter = s;
      return builder;
    },
    orderBy: (c: string, asc: boolean) => {
      calls.orderBy.push({ column: c, ascending: asc });
      return builder;
    },
    skip: (n: number) => {
      calls.skip = n;
      return builder;
    },
    top: (n: number) => {
      calls.top = n;
      return builder;
    },
    [Symbol.asyncIterator]() {
      calls.iteratorCalls++;
      let yielded = false;
      return {
        async next() {
          if (yielded) return { done: true, value: undefined };
          yielded = true;
          return { done: false, value: items };
        },
      };
    },
  };

  // Unfiltered countAsync path: list.select('ItemCount')()
  const list: any = {
    items: builder,
    select: (field: string) => {
      calls.listSelectField = field;
      return async () => ({ ItemCount: opts?.itemCount ?? 0 });
    },
  };
  const sp = {
    web: { lists: { getByTitle: () => list, getById: () => list } },
    batched: () => [sp, async () => undefined],
  };
  return { sp, calls };
}

describe("SharePointProvider.getItemsPagedAsync with options", () => {
  it("passes filter as OData string", async () => {
    const { sp, calls } = fakeListWithSpies();
    const provider = new SharePointProvider(sp as never);
    const filter: FilterNode = {
      kind: "compare",
      column: "Title",
      op: "eq",
      value: "A",
    };
    await provider.getItemsPagedAsync(
      { kind: "title", value: "Blogs" },
      ["Title"],
      10,
      undefined,
      { filter },
    );
    expect(calls.filter).toBe("(Title eq 'A') and FSObjType eq 0");
  });

  it("a provider-sourced expand clause selects the UIL's inline person columns and nothing else", async () => {
    const { sp, calls } = fakeListWithSpies();
    const provider = new SharePointProvider(sp as never);
    await provider.getItemsPagedAsync(
      { kind: "title", value: "Blogs" },
      ["Title"],
      10,
      undefined,
      {
        expand: [
          {
            navColumn: "Owner",
            selectFields: [
              "ID",
              "Title",
              "LoginName",
              "Email",
              "PrincipalType",
            ],
            source: { kind: "provider", key: "principals" },
          },
          { navColumn: "Program", selectFields: ["Title"] },
        ],
      },
    );
    expect(calls.expand).toEqual(["Owner", "Program"]);
    expect(calls.select).toEqual([
      "Title",
      "Owner/Id",
      "Owner/Title",
      "Owner/Name",
      "Owner/EMail",
      "Program/Title",
    ]);
  });

  it("passes orderBy keys with direction", async () => {
    const { sp, calls } = fakeListWithSpies();
    const provider = new SharePointProvider(sp as never);
    await provider.getItemsPagedAsync(
      { kind: "title", value: "Blogs" },
      ["Title"],
      10,
      undefined,
      {
        orderBy: [
          { column: "Title", direction: "asc" },
          { column: "ID", direction: "desc" },
        ],
      },
    );
    expect(calls.orderBy).toEqual([
      { column: "Title", ascending: true },
      { column: "ID", ascending: false },
    ]);
  });

  it("passes skip when > 0", async () => {
    const { sp, calls } = fakeListWithSpies();
    const provider = new SharePointProvider(sp as never);
    await provider.getItemsPagedAsync(
      { kind: "title", value: "Blogs" },
      ["Title"],
      10,
      undefined,
      { skip: 5 },
    );
    expect(calls.skip).toBe(5);
  });

  it("omits skip when 0 or undefined", async () => {
    const { sp, calls } = fakeListWithSpies();
    const provider = new SharePointProvider(sp as never);
    await provider.getItemsPagedAsync(
      { kind: "title", value: "Blogs" },
      ["Title"],
      10,
      undefined,
    );
    expect(calls.skip).toBeUndefined();
  });

  it("countAsync (unfiltered, default) iterates items-only instead of ItemCount", async () => {
    const { sp, calls } = fakeListWithSpies({ itemCount: 42 });
    const provider = new SharePointProvider(sp as never);
    const r = await provider.countAsync({ kind: "title", value: "Blogs" });
    expect(calls.listSelectField).toBeUndefined(); // ItemCount NOT read (it counts folders)
    expect(calls.iteratorCalls).toBe(1);
    expect(calls.filter).toBe("FSObjType eq 0");
    expect(r).toBe(2);
  });

  it("countAsync (unfiltered, includeContainers) keeps the cheap ItemCount path", async () => {
    const { sp, calls } = fakeListWithSpies({ itemCount: 42 });
    const provider = new SharePointProvider(sp as never);
    const r = await provider.countAsync(
      { kind: "title", value: "Blogs" },
      { includeContainers: true },
    );
    expect(calls.listSelectField).toBe("ItemCount");
    expect(calls.iteratorCalls).toBe(0);
    expect(r).toBe(42);
  });

  it("countAsync (filtered) drives the async iterator and sums page lengths", async () => {
    const { sp, calls } = fakeListWithSpies();
    const provider = new SharePointProvider(sp as never);
    const filter: FilterNode = {
      kind: "compare",
      column: "Title",
      op: "eq",
      value: "X",
    };
    const r = await provider.countAsync(
      { kind: "title", value: "Blogs" },
      { filter },
    );
    expect(calls.filter).toBe("(Title eq 'X') and FSObjType eq 0");
    expect(calls.top).toBe(5000);
    expect(calls.iteratorCalls).toBe(1);
    expect(r).toBe(2);
  });
});

class Notification extends SpeelEntity {
  Title?: string;
  EmailSent?: boolean;
}

/** A DbSet over the spy list — exercises the whole chain from the filter builder to `$filter`. */
function notificationSet(sp: unknown) {
  const mb = new ModelBuilder();
  // No principal entity registered: SpeelEntity's Author/Editor degrade to ids.
  mb.entity(Notification, (b) => {
    b.toList("Notifications");
    b.property((n) => n.Title).isText();
    b.property((n) => n.EmailSent).isBoolean();
  });
  const model = mb.build();
  const provider = new SharePointProvider(sp as never);
  return new DbSet<Notification>(
    Notification,
    model,
    provider,
    new ChangeTracker(model, provider),
  );
}

// SharePoint rejects `eq true` on a Yes/No column, so the emitted filter must carry 1/0.
describe("boolean filters reach the wire as 1/0", () => {
  it("isTrue()", async () => {
    const { sp, calls } = fakeListWithSpies();
    await notificationSet(sp)
      .where((b) => b.EmailSent.isTrue())
      .toArrayAsync();
    expect(calls.filter).toBe("(EmailSent eq 1) and FSObjType eq 0");
  });

  it("isFalse()", async () => {
    const { sp, calls } = fakeListWithSpies();
    await notificationSet(sp)
      .where((b) => b.EmailSent.isFalse())
      .toArrayAsync();
    expect(calls.filter).toBe("(EmailSent eq 0) and FSObjType eq 0");
  });

  it("ne(true) — the non-eq operator reachable on a boolean property", async () => {
    const { sp, calls } = fakeListWithSpies();
    await notificationSet(sp)
      .where((b) => b.EmailSent.ne(true))
      .toArrayAsync();
    expect(calls.filter).toBe("(EmailSent ne 1) and FSObjType eq 0");
  });
});
