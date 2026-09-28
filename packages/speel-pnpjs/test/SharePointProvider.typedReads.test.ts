// test/SharePointProvider.typedReads.test.ts
//
// Every read path types the columns its properties describe before the record
// leaves the provider; a read that passes none gets SharePoint's JSON as-is. The
// double serves wire shapes (ISO strings, 0/1, `{results}`), so a value coming back
// typed can only mean the path ran it through readValues.
import { describe, it, expect } from "vitest";
import type { IExpandClause, IListHandle, Property } from "@speel/core";
import {
  textProperty,
  numberProperty,
  booleanProperty,
  dateTimeProperty,
  lookupProperty,
  stubEntityType,
} from "@speel/core/testing";
import { SharePointProvider } from "../src/SharePointProvider.js";
import { fakePrincipalSp, UIL_ADA, SG_AUDIT } from "./fakePrincipalSp.js";

const blogs: IListHandle = { kind: "title", value: "Blogs" };
const tags = stubEntityType("Tags", {
  kind: "list",
  list: { kind: "title", value: "Tags" },
});
const FIELDS = ["Title", "IsPublished", "PublishedAt", "ViewCount", "TagsId"];
const PROPS: Property[] = [
  numberProperty("Id"),
  textProperty("Title"),
  booleanProperty("IsPublished"),
  dateTimeProperty("PublishedAt"),
  numberProperty("ViewCount"),
  lookupProperty("Tags", tags, { multi: true }),
];
const AUTHOR: IExpandClause = {
  navColumn: "Author",
  selectFields: ["Title", "Created"],
  properties: [
    numberProperty("Id"),
    textProperty("Title"),
    dateTimeProperty("Created"),
  ],
};
const ISO = [
  "2027-03-15T12:00:00Z",
  "2027-04-01T00:00:00Z",
  "2027-05-01T00:00:00Z",
];
// Built inside make(): the double copies only a row's top level, so nested
// objects (Author, TagsId.results) would otherwise be shared across tests.
const row = (id: number) => ({
  Id: id,
  Title: `Post ${id}`,
  IsPublished: id % 2,
  PublishedAt: ISO[id - 1]!,
  ViewCount: String(id * 10),
  TagsId: { results: [id, id + 1] },
  Author: { Id: "6", Title: "Ada", Created: "2027-01-01T00:00:00Z" },
});

const siteUsers = { kind: "provider" as const, key: "siteUsers" };
const principals = { kind: "provider" as const, key: "principals" };
// A site user whose PrincipalType arrives as a string — the double's way of showing
// that a provider-source record is typed, not just renamed.
const SU_STRINGLY = {
  Id: 6,
  Title: "Ada",
  LoginName: "i:0#.f|membership|ada@x",
  Email: "ada@x",
  PrincipalType: "1",
};

function make() {
  const { sp, queries } = fakePrincipalSp({
    uil: [{ ...UIL_ADA, EMail: 42 }],
    siteUsers: [SU_STRINGLY],
    siteGroups: [SG_AUDIT],
    lists: { Blogs: [row(1), row(2), row(3)] },
  });
  return { provider: new SharePointProvider(sp as never), queries };
}

const expectTyped = (r: Record<string, unknown> | null | undefined) => {
  expect(r).toBeTruthy();
  expect(r!.PublishedAt).toBeInstanceOf(Date);
  expect(r!.IsPublished).toBeTypeOf("boolean");
  expect(r!.ViewCount).toBeTypeOf("number");
  expect(Array.isArray(r!.TagsId)).toBe(true);
};
const expectRaw = (r: Record<string, unknown> | null | undefined) => {
  expect(r).toBeTruthy();
  expect(r!.PublishedAt).toBeTypeOf("string");
  expect(r!.IsPublished).toBeTypeOf("number");
  expect(r!.ViewCount).toBeTypeOf("string");
  expect(r!.TagsId).toEqual({ results: expect.any(Array) });
};

describe("SharePointProvider typed reads — getItemByIdAsync", () => {
  it("returns a Date (and every other typed value) when properties are passed", async () => {
    const { provider } = make();
    const r = await provider.getItemByIdAsync(blogs, 1, FIELDS, {
      properties: PROPS,
    });
    expectTyped(r);
    expect((r!.PublishedAt as Date).toISOString()).toBe(
      "2027-03-15T12:00:00.000Z",
    );
    expect(r).toMatchObject({
      Id: 1,
      IsPublished: true,
      ViewCount: 10,
      TagsId: [1, 2],
    });
  });
  it("returns the ISO string as-is without properties", async () => {
    const { provider } = make();
    expectRaw(await provider.getItemByIdAsync(blogs, 1, FIELDS));
  });
  it("types an expanded sub-record through IExpandClause.properties", async () => {
    const { provider, queries } = make();
    const r = await provider.getItemByIdAsync(blogs, 1, FIELDS, {
      expand: [AUTHOR],
      properties: PROPS,
    });
    expect(r!.Author).toEqual({
      Id: 6,
      Title: "Ada",
      Created: new Date("2027-01-01T00:00:00Z"),
    });
    // The $select/$expand the clause contributes is unchanged by typing.
    expect(queries[0]!.expand).toEqual(["Author"]);
    expect(queries[0]!.select).toContain("Author/Created");
  });
  it("still answers null for a 404", async () => {
    const { provider } = make();
    expect(
      await provider.getItemByIdAsync(blogs, 99, FIELDS, { properties: PROPS }),
    ).toBeNull();
  });
});

describe("SharePointProvider typed reads — getItemsByIdsAsync", () => {
  it("types every batched result and keeps a missing id null", async () => {
    const { provider } = make();
    const out = await provider.getItemsByIdsAsync(blogs, [1, 99, 3], FIELDS, {
      properties: PROPS,
    });
    expect(out).toHaveLength(3);
    expectTyped(out[0]);
    expect(out[1]).toBeNull();
    expectTyped(out[2]);
  });
  it("returns raw rows without properties", async () => {
    const { provider } = make();
    const [r] = await provider.getItemsByIdsAsync(blogs, [2], FIELDS);
    expectRaw(r);
  });
});

describe("SharePointProvider typed reads — getItemsPagedAsync", () => {
  it("types every page, including one resumed through a cursor", async () => {
    const { provider } = make();
    const options = { properties: PROPS, expand: [AUTHOR] };
    const p1 = await provider.getItemsPagedAsync(
      blogs,
      FIELDS,
      2,
      undefined,
      options,
    );
    expect(p1.items).toHaveLength(2);
    p1.items.forEach(expectTyped);
    expect(p1.items[0]!.Author).toMatchObject({
      Id: 6,
      Created: expect.any(Date),
    });
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await provider.getItemsPagedAsync(
      blogs,
      FIELDS,
      2,
      p1.nextCursor!,
      options,
    );
    expect(p2.items).toHaveLength(1);
    p2.items.forEach(expectTyped);
  });
  it("returns raw rows without properties", async () => {
    const { provider } = make();
    const p = await provider.getItemsPagedAsync(blogs, FIELDS, 10);
    p.items.forEach(expectRaw);
  });
});

describe("SharePointProvider typed reads — executeReadBatchAsync", () => {
  it("itemsByIds: types each point read with the descriptor's properties", async () => {
    const { provider } = make();
    const [res] = await provider.executeReadBatchAsync([
      {
        kind: "itemsByIds",
        source: blogs,
        ids: [1, 2],
        fields: FIELDS,
        expand: [AUTHOR],
        properties: PROPS,
        clientToken: "a",
      },
    ]);
    expect(res!.items).toHaveLength(2);
    res!.items.forEach(expectTyped);
    expect(res!.items[0]!.Author).toMatchObject({ Created: expect.any(Date) });
  });
  it("items: types the batched page with options.properties", async () => {
    const { provider, queries } = make();
    // Three rows, page size 10: the batched page is short, hence complete — no drain.
    const [res] = await provider.executeReadBatchAsync([
      {
        kind: "items",
        source: blogs,
        fields: FIELDS,
        pageSize: 10,
        options: { properties: PROPS, expand: [AUTHOR] },
        clientToken: "b",
      },
    ]);
    expect(queries.filter((q) => q.path === "list")).toHaveLength(1);
    expect(res!.items).toHaveLength(3);
    res!.items.forEach(expectTyped);
    expect(res!.items[2]!.Author).toMatchObject({ Created: expect.any(Date) });
  });
  it("items: a read the batch could not complete drains typed through the paged path", async () => {
    const { provider, queries } = make();
    // Page size equals the row count: a full page might have a successor, so the
    // provider re-reads it in full on the iterator — that path must type too.
    const [res] = await provider.executeReadBatchAsync([
      {
        kind: "items",
        source: blogs,
        fields: FIELDS,
        pageSize: 3,
        options: { properties: PROPS },
        clientToken: "c",
      },
    ]);
    expect(queries.filter((q) => q.path === "list").length).toBeGreaterThan(1);
    expect(res!.items).toHaveLength(3);
    res!.items.forEach(expectTyped);
  });
  it("returns raw rows when a descriptor carries no properties", async () => {
    const { provider } = make();
    const [byIds, items] = await provider.executeReadBatchAsync([
      {
        kind: "itemsByIds",
        source: blogs,
        ids: [1],
        fields: FIELDS,
        clientToken: "d",
      },
      {
        kind: "items",
        source: blogs,
        fields: FIELDS,
        pageSize: 10,
        clientToken: "e",
      },
    ]);
    expectRaw(byIds!.items[0]);
    items!.items.forEach(expectRaw);
  });
});

describe("SharePointProvider typed reads — getListItemChangesSinceToken", () => {
  it("types `changed` with the fifth parameter", async () => {
    const { provider } = make();
    const res = await provider.getListItemChangesSinceToken(
      blogs,
      "",
      FIELDS,
      [AUTHOR],
      PROPS,
    );
    expect(res.changed).toHaveLength(3);
    res.changed.forEach(expectTyped);
    expect(res.changed[0]!.Author).toMatchObject({ Created: expect.any(Date) });
    expect(res.newToken).toBe("1;3;g;638400000000000000;9");
  });
  it("returns raw rows without properties", async () => {
    const { provider } = make();
    const res = await provider.getListItemChangesSinceToken(blogs, "", FIELDS);
    res.changed.forEach(expectRaw);
  });
});

describe("SharePointProvider typed reads — provider sources", () => {
  const P = [
    numberProperty("Id"),
    textProperty("Title"),
    numberProperty("PrincipalType"),
  ];
  it("types a point read after inboundRecord has shaped it", async () => {
    const { provider } = make();
    const [r] = await provider.getItemsByIdsAsync(
      siteUsers,
      [6],
      ["Title", "PrincipalType"],
      { properties: P },
    );
    expect(r!.PrincipalType).toBe(1);
    const [raw] = await provider.getItemsByIdsAsync(
      siteUsers,
      [6],
      ["Title", "PrincipalType"],
    );
    expect(raw!.PrincipalType).toBe("1");
  });
  it("types a single-item read (getItemByIdAsync forwards opts to the by-ids path)", async () => {
    const { provider } = make();
    const r = await provider.getItemByIdAsync(
      siteUsers,
      6,
      ["Title", "PrincipalType"],
      { properties: P },
    );
    expect(r!.PrincipalType).toBe(1);
  });
  it("types a page after inboundRecord has shaped it", async () => {
    const { provider } = make();
    const page = await provider.getItemsPagedAsync(
      siteUsers,
      ["Title", "PrincipalType"],
      10,
      undefined,
      { properties: P },
    );
    expect(page.items[0]!.PrincipalType).toBe(1);
  });
  it("types a batched point read and a batched page (executeReadBatchAsync)", async () => {
    const { provider } = make();
    const [byIds, items] = await provider.executeReadBatchAsync([
      {
        kind: "itemsByIds",
        source: siteUsers,
        ids: [6],
        fields: ["Title", "PrincipalType"],
        properties: P,
        clientToken: "p1",
      },
      {
        kind: "items",
        source: siteUsers,
        fields: ["Title", "PrincipalType"],
        pageSize: 10,
        options: { properties: P },
        clientToken: "p2",
      },
    ]);
    expect(byIds!.items[0]!.PrincipalType).toBe(1);
    expect(items!.items[0]!.PrincipalType).toBe(1);
  });
  it("types the caller-spelled column, so the rename runs first (UIL EMail → Email)", async () => {
    const { provider } = make();
    // The UIL row carries EMail: 42; inboundRecord renames it to Email, and only
    // then does a Text property on Email have anything to type.
    const [r] = await provider.getItemsByIdsAsync(
      principals,
      [6],
      ["Title", "Email"],
      {
        properties: [textProperty("Email")],
      },
    );
    expect(r!.Email).toBe("42");
  });
});
