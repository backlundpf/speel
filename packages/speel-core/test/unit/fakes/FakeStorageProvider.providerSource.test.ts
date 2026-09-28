import { describe, it, expect, beforeEach } from "vitest";
import { FakeStorageProvider } from "./FakeStorageProvider.js";
import type { IProviderSource } from "../../../src/providers/ISharePointProvider.js";

const principals: IProviderSource = { kind: "provider", key: "principals" };
const siteUsers: IProviderSource = { kind: "provider", key: "siteUsers" };
const siteGroups: IProviderSource = { kind: "provider", key: "siteGroups" };
const FIELDS = ["Id", "Title", "LoginName", "Email", "PrincipalType"];

let p: FakeStorageProvider;
beforeEach(() => {
  p = new FakeStorageProvider();
  p.seedPrincipal({
    Id: 6,
    Title: "Ada",
    LoginName: "i:0#.f|membership|ada@x",
    Email: "ada@x",
    PrincipalType: 1,
  });
  p.seedPrincipal({
    Id: 12,
    Title: "Audit Members",
    LoginName: "Audit Members",
    PrincipalType: 8,
    Description: "Auditors",
    OwnerTitle: "Ada",
  });
  p.seedPrincipal({
    Id: 15,
    Title: "Everyone except external users",
    LoginName: "c:0-.f|rolemanager|spo-grid-all-users/x",
    PrincipalType: 4,
  });
});

describe("FakeStorageProvider provider sources — views", () => {
  it("principals is every principal; siteUsers excludes SharePoint groups; siteGroups is only them", async () => {
    const ids = async (s: IProviderSource) =>
      (await p.getItemsPagedAsync(s, ["Id"], 100)).items.map((r) => r.Id);
    expect(await ids(principals)).toEqual([6, 12, 15]);
    expect(await ids(siteUsers)).toEqual([6, 15]);
    expect(await ids(siteGroups)).toEqual([12]);
  });

  it("a security group reads as 4 from siteUsers but 8 from principals — the UIL cannot tell them apart", async () => {
    const [viaUsers] = await p.getItemsByIdsAsync(siteUsers, [15], FIELDS);
    const [viaUil] = await p.getItemsByIdsAsync(principals, [15], FIELDS);
    expect(viaUsers?.PrincipalType).toBe(4);
    expect(viaUil?.PrincipalType).toBe(8);
  });

  it("siteGroups reports PrincipalType 8 and its own columns", async () => {
    const [g] = await p.getItemsByIdsAsync(
      siteGroups,
      [12],
      [...FIELDS, "Description", "OwnerTitle"],
    );
    expect(g).toEqual({
      Id: 12,
      Title: "Audit Members",
      LoginName: "Audit Members",
      PrincipalType: 8,
      Description: "Auditors",
      OwnerTitle: "Ada",
    });
  });

  it("by-ids aligns to the ids asked for, null for a miss and for an id outside the view", async () => {
    const res = await p.getItemsByIdsAsync(siteUsers, [6, 999, 12], ["Id"]);
    expect(res).toEqual([{ Id: 6 }, null, null]);
  });

  it("getItemByIdAsync agrees with by-ids", async () => {
    expect(await p.getItemByIdAsync(principals, 6, FIELDS)).toEqual(
      (await p.getItemsByIdsAsync(principals, [6], FIELDS))[0],
    );
    expect(await p.getItemByIdAsync(siteGroups, 6, FIELDS)).toBeNull();
  });
});

describe("FakeStorageProvider provider sources — carriage", () => {
  it("omits a selected column the key cannot carry instead of failing", async () => {
    const [u] = await p.getItemsByIdsAsync(
      siteUsers,
      [6],
      ["Id", "Title", "Description", "OwnerTitle"],
    );
    expect(u).toEqual({ Id: 6, Title: "Ada" });
    const [g] = await p.getItemsByIdsAsync(siteGroups, [12], ["Id", "Email"]);
    expect(g).toEqual({ Id: 12 });

    // The records above simply lack those columns, which the projection would omit
    // anyway. Carriage is only proven by a record that HOLDS a value the key cannot
    // carry — and still comes back without it.
    p.seedPrincipal({
      Id: 7,
      Title: "Bob",
      LoginName: "i:0#.f|membership|bob@x",
      PrincipalType: 1,
      Description: "held, but not a siteUsers column",
      OwnerTitle: "held, but not a siteUsers column",
    });
    p.seedPrincipal({
      Id: 13,
      Title: "Audit Owners",
      LoginName: "Audit Owners",
      PrincipalType: 8,
      Email: "held, but not a siteGroups column",
    });
    const [bob] = await p.getItemsByIdsAsync(
      siteUsers,
      [7],
      ["Id", "Title", "Description", "OwnerTitle"],
    );
    expect(bob).toEqual({ Id: 7, Title: "Bob" });
    const [owners] = await p.getItemsByIdsAsync(
      siteGroups,
      [13],
      ["Id", "Email"],
    );
    expect(owners).toEqual({ Id: 13 });
  });

  it("passes any other endpoint column through untranslated — projected when the seed holds it, filterable and orderable", async () => {
    // The uncarried table is a per-key blacklist mirroring pnpjs's null rows, not a
    // whitelist: a column the endpoint really holds (IsSiteAdmin on web/siteusers)
    // reaches the caller as the endpoint would answer it — the endpoint decides.
    p.seedPrincipal({
      Id: 8,
      Title: "Site Admin",
      LoginName: "i:0#.f|membership|zed@x",
      PrincipalType: 1,
      IsSiteAdmin: true,
      UserPrincipalName: "zed@x",
    });
    p.seedPrincipal({
      Id: 9,
      Title: "Other Admin",
      LoginName: "i:0#.f|membership|amy@x",
      PrincipalType: 1,
      IsSiteAdmin: true,
      UserPrincipalName: "amy@x",
    });
    const [admin] = await p.getItemsByIdsAsync(
      siteUsers,
      [8],
      ["Id", "Title", "IsSiteAdmin"],
    );
    expect(admin).toEqual({ Id: 8, Title: "Site Admin", IsSiteAdmin: true });
    // A seed without the column projects nothing for it, like an absent value live.
    const [ada] = await p.getItemsByIdsAsync(siteUsers, [6], ["IsSiteAdmin"]);
    expect(ada).toEqual({ Id: 6 });
    const isAdmin = {
      kind: "compare" as const,
      column: "IsSiteAdmin",
      op: "eq" as const,
      value: true,
    };
    const filtered = await p.getItemsPagedAsync(
      siteUsers,
      ["Id"],
      10,
      undefined,
      { filter: isAdmin },
    );
    expect(filtered.items.map((r) => r.Id)).toEqual([8, 9]);
    const ordered = await p.getItemsPagedAsync(
      siteUsers,
      ["Id"],
      10,
      undefined,
      {
        filter: isAdmin,
        orderBy: [{ column: "UserPrincipalName", direction: "asc" }],
      },
    );
    expect(ordered.items.map((r) => r.Id)).toEqual([9, 8]);
  });

  it("refuses to filter on a column the key cannot carry", async () => {
    await expect(
      p.getItemsPagedAsync(siteUsers, ["Id"], 10, undefined, {
        filter: {
          kind: "compare",
          column: "Description",
          op: "eq",
          value: "x",
        },
      }),
    ).rejects.toMatchObject({ name: "QueryTranslationException" });
    await expect(
      p.getItemsPagedAsync(siteGroups, ["Id"], 10, undefined, {
        filter: { kind: "compare", column: "Email", op: "eq", value: "x" },
      }),
    ).rejects.toMatchObject({ name: "QueryTranslationException" });
  });

  it("refuses to order by a column the key cannot carry", async () => {
    await expect(
      p.getItemsPagedAsync(siteUsers, ["Id"], 10, undefined, {
        orderBy: [{ column: "OwnerTitle", direction: "asc" }],
      }),
    ).rejects.toThrow(/OwnerTitle/);
  });

  it("refuses a PrincipalType value the principals source cannot express, but not on siteUsers", async () => {
    const eq4 = {
      filter: {
        kind: "compare" as const,
        column: "PrincipalType",
        op: "eq" as const,
        value: 4,
      },
    };
    await expect(
      p.getItemsPagedAsync(principals, ["Id"], 10, undefined, eq4),
    ).rejects.toMatchObject({ name: "QueryTranslationException" });
    const { items } = await p.getItemsPagedAsync(
      siteUsers,
      ["Id"],
      10,
      undefined,
      eq4,
    );
    expect(items.map((r) => r.Id)).toEqual([15]);
  });

  it("derived PrincipalType selects everywhere but is not filterable on siteGroups nor orderable on principals/siteGroups — a real column on siteUsers", async () => {
    const eq = (value: number) => ({
      filter: {
        kind: "compare" as const,
        column: "PrincipalType",
        op: "eq" as const,
        value,
      },
    });
    const orderBy = {
      orderBy: [{ column: "PrincipalType", direction: "asc" as const }],
    };
    // siteGroups synthesises 8; the endpoint has no such column to filter or order.
    await expect(
      p.getItemsPagedAsync(siteGroups, ["Id"], 10, undefined, eq(8)),
    ).rejects.toMatchObject({
      name: "QueryTranslationException",
      message: expect.stringMatching(/'siteGroups'.*'PrincipalType'/),
    });
    await expect(
      p.getItemsPagedAsync(siteGroups, ["Id"], 10, undefined, orderBy),
    ).rejects.toThrow(/PrincipalType/);
    // principals derives it from ContentTypeId: filterable as eq/ne/in over {1, 8}, never orderable.
    await expect(
      p.getItemsPagedAsync(principals, ["Id"], 10, undefined, orderBy),
    ).rejects.toThrow(/PrincipalType/);
    await expect(
      p.getItemsPagedAsync(principals, ["Id"], 10, undefined, {
        filter: {
          kind: "compare",
          column: "PrincipalType",
          op: "gt",
          value: 1,
        },
      }),
    ).rejects.toMatchObject({
      name: "QueryTranslationException",
      message: expect.stringMatching(/only eq\/ne\/in \(got gt\)/),
    });
    // The message matters here: without the shape check an is-null leaf would still
    // be refused, but by the value check complaining about `undefined`.
    await expect(
      p.getItemsPagedAsync(principals, ["Id"], 10, undefined, {
        filter: { kind: "is-null", column: "PrincipalType", negate: true },
      }),
    ).rejects.toMatchObject({
      name: "QueryTranslationException",
      message: expect.stringMatching(/'is-null' filter/),
    });
    const ne8 = await p.getItemsPagedAsync(principals, ["Id"], 10, undefined, {
      filter: { kind: "compare", column: "PrincipalType", op: "ne", value: 8 },
    });
    expect(ne8.items.map((r) => r.Id)).toEqual([6]);
    // Selecting it still works on every key — derived means projected, not absent.
    const [g] = await p.getItemsByIdsAsync(siteGroups, [12], ["PrincipalType"]);
    expect(g).toEqual({ Id: 12, PrincipalType: 8 });
    // siteUsers holds a real PrincipalType: both filter and order reach it.
    const users = await p.getItemsPagedAsync(siteUsers, ["Id"], 10, undefined, {
      ...eq(1),
      ...orderBy,
    });
    expect(users.items.map((r) => r.Id)).toEqual([6]);
    const ordered = await p.getItemsPagedAsync(
      siteUsers,
      ["Id", "PrincipalType"],
      10,
      undefined,
      { orderBy: [{ column: "PrincipalType", direction: "desc" }] },
    );
    expect(ordered.items.map((r) => r.PrincipalType)).toEqual([4, 1]);
  });

  it("a `not` over a subtree that mentions PrincipalType is refused on principals, like the real provider; directly over the leaf it evaluates, and on siteUsers it is a real column", async () => {
    const isUser = {
      kind: "compare" as const,
      column: "PrincipalType",
      op: "eq" as const,
      value: 1,
    };
    const isAda = {
      kind: "compare" as const,
      column: "Title",
      op: "eq" as const,
      value: "Ada",
    };
    const deep = {
      filter: {
        kind: "not" as const,
        child: { kind: "and" as const, children: [isUser, isAda] },
      },
    };
    // pnpjs would have to emit `not (startswith(ContentTypeId, …))`, which SharePoint
    // 400s, so it refuses; the fake could evaluate the tree, but must not answer what
    // the real provider will not.
    await expect(
      p.getItemsPagedAsync(principals, ["Id"], 10, undefined, deep),
    ).rejects.toMatchObject({
      name: "QueryTranslationException",
      message: expect.stringMatching(/cannot negate a content-type test/),
    });
    // Nested not-of-not over the leaf is deeper too — no pushing through.
    await expect(
      p.countAsync(principals, {
        filter: { kind: "not", child: { kind: "not", child: isUser } },
      }),
    ).rejects.toMatchObject({ name: "QueryTranslationException" });
    // Directly over the leaf the negation folds in (not eq 1 ≡ ne 1): the groups.
    const folded = await p.getItemsPagedAsync(
      principals,
      ["Id"],
      10,
      undefined,
      {
        filter: { kind: "not", child: isUser },
      },
    );
    expect(folded.items.map((r) => r.Id)).toEqual([12, 15]);
    // siteUsers holds a real PrincipalType column: the same tree evaluates there.
    const users = await p.getItemsPagedAsync(
      siteUsers,
      ["Id"],
      10,
      undefined,
      deep,
    );
    expect(users.items.map((r) => r.Id)).toEqual([15]);
  });

  it("refuses a container predicate anywhere in the tree — a provider source has no folders", async () => {
    await expect(
      p.getItemsPagedAsync(principals, ["Id"], 10, undefined, {
        filter: {
          kind: "and",
          children: [
            { kind: "compare", column: "PrincipalType", op: "eq", value: 1 },
            { kind: "container-scope", path: "a", recursive: true },
          ],
        },
      }),
    ).rejects.toMatchObject({
      name: "QueryTranslationException",
      message: expect.stringMatching(/'principals'.*container-scope/),
    });
    await expect(
      p.countAsync(siteGroups, { filter: { kind: "include-containers" } }),
    ).rejects.toMatchObject({ name: "QueryTranslationException" });
  });

  it("refuses expand — a provider source has no navigations", async () => {
    const expand = [{ navColumn: "Owner", selectFields: ["Title"] }];
    await expect(
      p.getItemsByIdsAsync(siteGroups, [12], ["Id"], { expand }),
    ).rejects.toThrow(/expand/);
    await expect(
      p.getItemsPagedAsync(siteGroups, ["Id"], 10, undefined, { expand }),
    ).rejects.toThrow(/expand/);
  });
});

describe("FakeStorageProvider provider sources — query", () => {
  it("filters and orders on ID as well as Id — list rows expose both spellings", async () => {
    const byId = await p.getItemsPagedAsync(principals, ["Id"], 10, undefined, {
      filter: { kind: "compare", column: "ID", op: "eq", value: 6 },
    });
    expect(byId.items.map((r) => r.Id)).toEqual([6]);
    const desc = await p.getItemsPagedAsync(principals, ["Id"], 10, undefined, {
      orderBy: [{ column: "ID", direction: "desc" }],
    });
    expect(desc.items.map((r) => r.Id)).toEqual([15, 12, 6]);
    // The alias is for evaluation only; the projection still answers `Id`.
    expect(byId.items[0]).toEqual({ Id: 6 });
  });

  it("filters, orders, skips and pages the view", async () => {
    const page1 = await p.getItemsPagedAsync(
      principals,
      ["Id", "Title"],
      2,
      undefined,
      {
        orderBy: [{ column: "Title", direction: "desc" }],
      },
    );
    expect(page1.items.map((r) => r.Title)).toEqual([
      "Everyone except external users",
      "Audit Members",
    ]);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await p.getItemsPagedAsync(
      principals,
      ["Id", "Title"],
      2,
      page1.nextCursor!,
      {
        orderBy: [{ column: "Title", direction: "desc" }],
      },
    );
    expect(page2.items.map((r) => r.Title)).toEqual(["Ada"]);
    expect(page2.nextCursor).toBeNull();

    // skip drops rows before paging starts, so the cursor offsets the post-skip set.
    const skipped = await p.getItemsPagedAsync(
      principals,
      ["Id"],
      10,
      undefined,
      {
        skip: 1,
      },
    );
    expect(skipped.items.map((r) => r.Id)).toEqual([12, 15]);
    const skipPage1 = await p.getItemsPagedAsync(
      principals,
      ["Id"],
      1,
      undefined,
      {
        skip: 1,
      },
    );
    expect(skipPage1.items.map((r) => r.Id)).toEqual([12]);
    const skipPage2 = await p.getItemsPagedAsync(
      principals,
      ["Id"],
      1,
      skipPage1.nextCursor!,
      { skip: 1 },
    );
    expect(skipPage2.items.map((r) => r.Id)).toEqual([15]);
    expect(skipPage2.nextCursor).toBeNull();

    const users = await p.getItemsPagedAsync(
      principals,
      ["Id"],
      10,
      undefined,
      {
        filter: {
          kind: "compare",
          column: "PrincipalType",
          op: "eq",
          value: 1,
        },
      },
    );
    expect(users.items.map((r) => r.Id)).toEqual([6]);

    const byLogin = await p.getItemsPagedAsync(
      principals,
      ["Id"],
      10,
      undefined,
      {
        filter: {
          kind: "compare",
          column: "LoginName",
          op: "eq",
          value: "Audit Members",
        },
      },
    );
    expect(byLogin.items.map((r) => r.Id)).toEqual([12]);
  });

  it("counts the filtered view", async () => {
    expect(await p.countAsync(siteUsers)).toBe(2);
    expect(
      await p.countAsync(principals, {
        filter: {
          kind: "compare",
          column: "PrincipalType",
          op: "eq",
          value: 8,
        },
      }),
    ).toBe(2);
  });

  it("throws for an unknown key, naming it", async () => {
    const nope: IProviderSource = { kind: "provider", key: "nope" };
    await expect(p.getItemsPagedAsync(nope, ["Id"], 10)).rejects.toThrow(
      /'nope'/,
    );
    await expect(p.getItemsByIdsAsync(nope, [1], ["Id"])).rejects.toThrow(
      /'nope'/,
    );
    await expect(p.countAsync(nope)).rejects.toThrow(/'nope'/);
  });

  it("serves provider sources through executeReadBatchAsync", async () => {
    const [res] = await p.executeReadBatchAsync([
      {
        kind: "itemsByIds",
        source: principals,
        ids: [6, 12],
        fields: FIELDS,
        clientToken: "a",
      },
    ]);
    expect(res!.items.map((r) => r.Id)).toEqual([6, 12]);
  });
});

describe("FakeStorageProvider provider sources — the include route warms the login cache", () => {
  // Core's `.include()` over a person navigation is an `itemsByIds` read on the
  // `principals` source. Whether that read carried the login home decides whether
  // a following folder insert has to resolve the id: only a projected, non-empty
  // LoginName warms. Killing line: the `returnedPrincipalIds.add(p.Id)` under
  // the LoginName gate in projectPrincipal.
  const list = { kind: "title" as const, value: "Docs" };
  async function folderInsertNaming6(fake: FakeStorageProvider) {
    const { lookupProperty, stubEntityType } =
      await import("../../../src/testing/properties.js");
    const OWNER = lookupProperty(
      "Owner",
      stubEntityType("Principal", { kind: "provider", key: "principals" }),
    );
    const [res] = await fake.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [{ property: OWNER, value: 6 }],
        folderServerRelativeUrl: "/sites/dev/Docs/F",
        clientToken: "i",
      },
    ]);
    return res!;
  }

  it("a by-ids read that carried LoginName home makes a later folder insert resolve nothing", async () => {
    await p.getItemsByIdsAsync(principals, [6], ["Id", "LoginName"]);
    expect((await folderInsertNaming6(p)).kind).toBe("success");
    expect(p.principalResolves()).toEqual([]);
  });

  it("a row with an empty LoginName warms nothing: the folder insert still resolves, and fails for want of a login", async () => {
    const q = new FakeStorageProvider();
    q.seedPrincipal({ Id: 6, Title: "Ada", LoginName: "", PrincipalType: 1 });
    await q.getItemsByIdsAsync(principals, [6], ["Id", "LoginName"]);
    expect((await folderInsertNaming6(q)).kind).toBe("failure");
    expect(q.principalResolves()).toEqual([6]);
  });

  it("a by-ids read that did not select LoginName warms nothing", async () => {
    await p.getItemsByIdsAsync(principals, [6], ["Id", "Title"]);
    expect((await folderInsertNaming6(p)).kind).toBe("success");
    expect(p.principalResolves()).toEqual([6]);
  });
});
