import { describe, it, expect } from "vitest";
import { SharePointProvider } from "../src/SharePointProvider.js";
import {
  fakePrincipalSp,
  UIL_ADA,
  UIL_GROUP,
  SU_ADA,
  SU_EVERYONE,
  SG_AUDIT,
} from "./fakePrincipalSp.js";

const principals = { kind: "provider" as const, key: "principals" };
const siteUsers = { kind: "provider" as const, key: "siteUsers" };
const siteGroups = { kind: "provider" as const, key: "siteGroups" };
const FIELDS = ["Id", "Title", "LoginName", "Email", "PrincipalType"];

function make() {
  const { sp, queries } = fakePrincipalSp({
    uil: [UIL_ADA, UIL_GROUP],
    siteUsers: [SU_ADA, SU_EVERYONE],
    siteGroups: [SG_AUDIT],
  });
  return { provider: new SharePointProvider(sp as never), queries };
}

describe("SharePointProvider provider sources — routing and $select", () => {
  it("routes each key to its endpoint", async () => {
    const { provider, queries } = make();
    await provider.getItemsByIdsAsync(principals, [6], ["Title"]);
    await provider.getItemsByIdsAsync(siteUsers, [6], ["Title"]);
    await provider.getItemsByIdsAsync(siteGroups, [12], ["Title"]);
    expect(queries.map((q) => q.path)).toEqual([
      "siteUserInfoList",
      "siteUsers",
      "siteGroups",
    ]);
  });

  it("UIL $select never contains PrincipalType and always contains ContentTypeId", async () => {
    const { provider, queries } = make();
    await provider.getItemsByIdsAsync(principals, [6], FIELDS);
    await provider.getItemsPagedAsync(principals, FIELDS, 10);
    await provider.countAsync(principals);
    for (const q of queries) {
      expect(q.select).not.toContain("PrincipalType");
    }
    expect(queries[0]!.select).toEqual([
      "Id",
      "Title",
      "Name",
      "EMail",
      "ContentTypeId",
    ]);
    expect(queries[1]!.select).toEqual([
      "Id",
      "Title",
      "Name",
      "EMail",
      "ContentTypeId",
    ]);
  });

  it("returns UIL records in model spelling with PrincipalType derived", async () => {
    const { provider } = make();
    const [u, g, none] = await provider.getItemsByIdsAsync(
      principals,
      [6, 12, 99],
      FIELDS,
    );
    expect(u).toEqual({
      Id: 6,
      Title: "Ada",
      LoginName: "i:0#.f|membership|ada@x",
      Email: "ada@x",
      PrincipalType: 1,
    });
    expect(g).toEqual({
      Id: 12,
      Title: "Audit Members",
      LoginName: "Audit Members",
      PrincipalType: 8,
    });
    expect(none).toBeNull();
  });

  it("returns siteGroups records with PrincipalType 8 synthesised and no Email asked of the endpoint", async () => {
    const { provider, queries } = make();
    const { items } = await provider.getItemsPagedAsync(
      siteGroups,
      [...FIELDS, "Description"],
      10,
    );
    expect(items).toEqual([
      {
        Id: 12,
        Title: "Audit Members",
        LoginName: "Audit Members",
        PrincipalType: 8,
        Description: "d",
      },
    ]);
    expect(queries[0]!.select).toEqual([
      "Id",
      "Title",
      "LoginName",
      "Description",
    ]);
  });

  it("throws for an unknown key before touching the network", async () => {
    const { provider, queries } = make();
    await expect(
      provider.getItemsPagedAsync(
        { kind: "provider", key: "nope" },
        ["Id"],
        10,
      ),
    ).rejects.toThrow(/'nope'/);
    expect(queries).toEqual([]);
  });

  it("refuses to expand a provider source", async () => {
    const { provider } = make();
    await expect(
      provider.getItemsByIdsAsync(siteUsers, [6], ["Id"], {
        expand: [{ navColumn: "X", selectFields: [] }],
      }),
    ).rejects.toThrow(/expand/);
  });
});

describe("SharePointProvider provider sources — $filter/$orderby/$top/$skip", () => {
  it("translates the filter and order per key, and appends no FSObjType clause", async () => {
    const { provider, queries } = make();
    await provider.getItemsPagedAsync(principals, ["Id"], 10, undefined, {
      filter: { kind: "compare", column: "LoginName", op: "eq", value: "x" },
      orderBy: [{ column: "Email", direction: "desc" }],
    });
    expect(queries[0]).toMatchObject({
      filter: "Name eq 'x'",
      orderBy: [["EMail", false]],
      top: 10,
    });
    await provider.getItemsPagedAsync(siteUsers, ["Id"], 10, undefined, {
      filter: { kind: "compare", column: "PrincipalType", op: "eq", value: 1 },
    });
    expect(queries[1]).toMatchObject({
      path: "siteUsers",
      filter: "PrincipalType eq 1",
    });
  });

  it("pages the two collections by offset, and honours skip on the first page", async () => {
    const { provider, queries } = make();
    const p1 = await provider.getItemsPagedAsync(
      siteUsers,
      ["Id"],
      1,
      undefined,
      { skip: 1 },
    );
    expect(queries[0]).toMatchObject({ path: "siteUsers", skip: 1, top: 1 });
    expect(p1.items.map((r) => r.Id)).toEqual([15]);
    expect(p1.nextCursor).toBe("2");
    const p2 = await provider.getItemsPagedAsync(
      siteUsers,
      ["Id"],
      1,
      p1.nextCursor!,
    );
    expect(queries[1]).toMatchObject({ skip: 2, top: 1 });
    expect(p2).toEqual({ items: [], nextCursor: null });
  });

  it("rejects a cursor that did not come from an offset-paged read", async () => {
    const { provider, queries } = make();
    await expect(
      provider.getItemsPagedAsync(siteUsers, ["Id"], 1, "c-nope"),
    ).rejects.toThrow(/cursor/);
    expect(queries).toEqual([]);
  });

  it("pages the UIL through the list iterator with a continuation cursor", async () => {
    const { provider } = make();
    const p1 = await provider.getItemsPagedAsync(principals, ["Id"], 1);
    expect(p1.items.map((r) => r.Id)).toEqual([6]);
    expect(p1.nextCursor).toMatch(/^c-/);
    const p2 = await provider.getItemsPagedAsync(
      principals,
      ["Id"],
      1,
      p1.nextCursor!,
    );
    expect(p2.items.map((r) => r.Id)).toEqual([12]);
  });

  it("counts a provider source", async () => {
    const { provider } = make();
    expect(await provider.countAsync(siteGroups)).toBe(1);
    expect(await provider.countAsync(principals)).toBe(2);
  });
});

describe("SharePointProvider provider sources — read batch", () => {
  it("serves itemsByIds and items on provider sources inside executeReadBatchAsync", async () => {
    const { provider } = make();
    const results = await provider.executeReadBatchAsync([
      {
        kind: "itemsByIds",
        source: principals,
        ids: [6, 99],
        fields: FIELDS,
        clientToken: "a",
      },
      {
        kind: "items",
        source: siteGroups,
        fields: ["Id", "PrincipalType"],
        pageSize: 10,
        clientToken: "b",
      },
    ]);
    expect(results.find((r) => r.clientToken === "a")!.items).toEqual([
      {
        Id: 6,
        Title: "Ada",
        LoginName: "i:0#.f|membership|ada@x",
        Email: "ada@x",
        PrincipalType: 1,
      },
    ]);
    expect(results.find((r) => r.clientToken === "b")!.items).toEqual([
      { Id: 12, PrincipalType: 8 },
    ]);
  });
});
