import { describe, it, expect, beforeEach } from "vitest";
import { FakeStorageProvider } from "./FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";
import type { FilterNode } from "../../../src/Query/FilterNode.js";
import type { IGetItemsOptions } from "../../../src/providers/ISharePointProvider.js";
import {
  textProperty,
  choiceProperty,
  dateTimeProperty,
} from "../../../src/testing/properties.js";

const list: IListHandle = { kind: "title", value: "Blogs" };
const TITLE = textProperty("Title");
const TAGS = choiceProperty("Tags", { multi: true });
const WHEN = dateTimeProperty("When");

describe("FakeStorageProvider", () => {
  let provider: FakeStorageProvider;
  beforeEach(() => {
    provider = new FakeStorageProvider();
  });

  it("returns null for missing getItemByIdAsync", async () => {
    expect(await provider.getItemByIdAsync(list, 1, ["Title"])).toBeNull();
  });

  it("round-trips an insert then getItemByIdAsync", async () => {
    const [res] = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [{ property: TITLE, value: "Hello" }],
        folderServerRelativeUrl: null,
        clientToken: "t1",
      },
    ]);
    expect(res?.kind).toBe("success");
    if (res?.kind !== "success") throw new Error();
    const id = res.serverData!.id;
    const item = await provider.getItemByIdAsync(list, id, ["Title"]);
    expect(item).toEqual({ ID: id, Title: "Hello" });
  });

  it("selects only requested fields", async () => {
    provider.seedRow(list, { Title: "A", Body: "B" });
    const item = await provider.getItemByIdAsync(list, 1, ["Title"]);
    expect(item).toEqual({ ID: 1, Title: "A" });
  });

  it("updates a stored item", async () => {
    provider.seedRow(list, { Title: "A" });
    const r = await provider.executeBatchAsync([
      {
        kind: "update",
        list,
        id: 1,
        fields: [{ property: TITLE, value: "B" }],
        etag: "*",
        clientToken: "u",
      },
    ]);
    expect(r[0]?.kind).toBe("success");
    const item = await provider.getItemByIdAsync(list, 1, ["Title"]);
    expect(item).toEqual({ ID: 1, Title: "B" });
  });

  it("deletes a stored item", async () => {
    provider.seedRow(list, { Title: "A" });
    await provider.executeBatchAsync([
      {
        kind: "delete",
        list,
        id: 1,
        etag: "*",
        permanent: false,
        clientToken: "d",
      },
    ]);
    expect(await provider.getItemByIdAsync(list, 1, ["Title"])).toBeNull();
  });

  it("pages through items", async () => {
    for (let i = 0; i < 5; i++) {
      provider.seedRow(list, { Title: `t${i}` });
    }
    const p1 = await provider.getItemsPagedAsync(list, ["Title"], 2);
    expect(p1.items.length).toBe(2);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await provider.getItemsPagedAsync(
      list,
      ["Title"],
      2,
      p1.nextCursor!,
    );
    expect(p2.items.length).toBe(2);
    const p3 = await provider.getItemsPagedAsync(
      list,
      ["Title"],
      2,
      p2.nextCursor!,
    );
    expect(p3.items.length).toBe(1);
    expect(p3.nextCursor).toBeNull();
  });

  it("supports failure injection by clientToken, and a failed insert takes no id", async () => {
    provider.failOn("boom", { status: 500, body: "kaboom" });
    const [r] = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [{ property: TITLE, value: "A" }],
        folderServerRelativeUrl: null,
        clientToken: "boom",
      },
    ]);
    expect(r?.kind).toBe("failure");
    if (r?.kind !== "failure") throw new Error();
    expect(r.status).toBe(500);
    expect(await provider.countAsync(list)).toBe(0);
    expect(provider.seedRow(list, { Title: "next" })).toBe(1);
  });

  // A test double must never show an UNSAVED edit as persisted. Three seams
  // alias otherwise: what a write stores, what a seed stores, what a read
  // hands out. Killing lines: `cloneValue(value)` in applyFields,
  // `cloneRecord(record)` in seedRow, `cloneValue(item[f])` in project.
  it("a read hands out copies: mutating what getItemByIdAsync returned leaves the next read unchanged", async () => {
    const [res] = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [
          { property: TAGS, value: ["a"] },
          { property: WHEN, value: new Date("2026-01-02T03:04:05Z") },
        ],
        folderServerRelativeUrl: null,
        clientToken: "t1",
      },
    ]);
    if (res?.kind !== "success") throw new Error();
    const id = res.serverData!.id;
    const first = await provider.getItemByIdAsync(list, id, ["Tags", "When"]);
    (first!.Tags as string[]).push("b");
    (first!.When as Date).setUTCFullYear(1999);
    const second = await provider.getItemByIdAsync(list, id, ["Tags", "When"]);
    expect(second!.Tags).toEqual(["a"]);
    expect((second!.When as Date).toISOString()).toBe(
      "2026-01-02T03:04:05.000Z",
    );
  });

  it("a write stores copies: mutating the caller's array or Date after insert leaves the row unchanged", async () => {
    const tags = ["a"];
    const when = new Date("2026-01-02T03:04:05Z");
    const [res] = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [
          { property: TAGS, value: tags },
          { property: WHEN, value: when },
        ],
        folderServerRelativeUrl: null,
        clientToken: "t1",
      },
    ]);
    if (res?.kind !== "success") throw new Error();
    tags.push("b");
    when.setUTCFullYear(1999);
    const row = await provider.getItemByIdAsync(list, res.serverData!.id, [
      "Tags",
      "When",
    ]);
    expect(row!.Tags).toEqual(["a"]);
    expect((row!.When as Date).toISOString()).toBe("2026-01-02T03:04:05.000Z");
  });

  it("seedRow stores copies: mutating the seed record afterwards leaves the row unchanged", async () => {
    const rec = { Tags: ["a"], When: new Date("2026-01-02T03:04:05Z") };
    const id = provider.seedRow(list, rec);
    rec.Tags.push("b");
    rec.When.setUTCFullYear(1999);
    const row = await provider.getItemByIdAsync(list, id, ["Tags", "When"]);
    expect(row!.Tags).toEqual(["a"]);
    expect((row!.When as Date).toISOString()).toBe("2026-01-02T03:04:05.000Z");
  });
});

describe("FakeStorageProvider query options", () => {
  let provider: FakeStorageProvider;
  const list = { kind: "title" as const, value: "Blogs" };
  beforeEach(async () => {
    provider = new FakeStorageProvider();
    for (let i = 1; i <= 3; i++) {
      provider.seedRow(list, { Title: `T${i}`, Views: i * 10 });
    }
  });

  it("filters by compare-eq", async () => {
    const filter: FilterNode = {
      kind: "compare",
      column: "Title",
      op: "eq",
      value: "T2",
    };
    const p = await provider.getItemsPagedAsync(
      list,
      ["Title", "Views"],
      10,
      undefined,
      { filter },
    );
    expect(p.items.length).toBe(1);
    expect((p.items[0] as Record<string, unknown>).Title).toBe("T2");
  });

  it("filters with and / or / not", async () => {
    const filter: FilterNode = {
      kind: "or",
      children: [
        { kind: "compare", column: "Views", op: "eq", value: 10 },
        { kind: "compare", column: "Views", op: "eq", value: 30 },
      ],
    };
    const p = await provider.getItemsPagedAsync(
      list,
      ["Views"],
      10,
      undefined,
      { filter },
    );
    expect(
      p.items.map((i) => (i as Record<string, unknown>).Views).sort(),
    ).toEqual([10, 30]);
  });

  it("orders by a column desc", async () => {
    const options: IGetItemsOptions = {
      orderBy: [{ column: "Views", direction: "desc" }],
    };
    const p = await provider.getItemsPagedAsync(
      list,
      ["Title", "Views"],
      10,
      undefined,
      options,
    );
    expect(p.items.map((i) => (i as Record<string, unknown>).Views)).toEqual([
      30, 20, 10,
    ]);
  });

  it("honors skip", async () => {
    const p = await provider.getItemsPagedAsync(
      list,
      ["Title"],
      10,
      undefined,
      { skip: 2 },
    );
    expect(p.items.length).toBe(1);
    expect((p.items[0] as Record<string, unknown>).Title).toBe("T3");
  });

  it("countAsync returns full count with no filter", async () => {
    expect(await provider.countAsync(list)).toBe(3);
  });

  it("countAsync respects filter", async () => {
    const filter: FilterNode = {
      kind: "compare",
      column: "Views",
      op: "gt",
      value: 15,
    };
    expect(await provider.countAsync(list, { filter })).toBe(2);
  });

  it("filters by string startsWith", async () => {
    const filter: FilterNode = {
      kind: "string",
      column: "Title",
      op: "startsWith",
      value: "T",
    };
    const p = await provider.getItemsPagedAsync(
      list,
      ["Title"],
      10,
      undefined,
      { filter },
    );
    expect(p.items.length).toBe(3);
  });

  it("filters by in (set membership)", async () => {
    const filter: FilterNode = {
      kind: "in",
      column: "Title",
      values: ["T1", "T3"],
      negate: false,
    };
    const p = await provider.getItemsPagedAsync(
      list,
      ["Title"],
      10,
      undefined,
      { filter },
    );
    expect(
      p.items.map((i) => (i as Record<string, unknown>).Title).sort(),
    ).toEqual(["T1", "T3"]);
  });

  it("filters by is-null (negate=true for not null)", async () => {
    provider.seedRow(list, { Title: null, Views: 0 });
    const isNullFilter: FilterNode = {
      kind: "is-null",
      column: "Title",
      negate: false,
    };
    const r1 = await provider.getItemsPagedAsync(
      list,
      ["Title"],
      10,
      undefined,
      { filter: isNullFilter },
    );
    expect(r1.items.length).toBe(1);

    const isNotNullFilter: FilterNode = {
      kind: "is-null",
      column: "Title",
      negate: true,
    };
    const r2 = await provider.getItemsPagedAsync(
      list,
      ["Title"],
      10,
      undefined,
      { filter: isNotNullFilter },
    );
    expect(r2.items.length).toBe(3);
  });
});
