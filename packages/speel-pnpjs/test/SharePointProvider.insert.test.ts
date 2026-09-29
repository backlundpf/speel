// test/SharePointProvider.insert.test.ts
//
// The typed `insert` op and typed upload metadata: the list root posts JSON through
// items.add; a folder posts form values whose person columns carry claims Keys.
// Both resolve the principals they name through the User Information List once per
// batch and never again once the per-instance cache holds them — the folder path
// for the logins, the root path because items.add does not validate a person id
// (live it stores a dangling reference), so the provider must.
import { describe, it, expect } from "vitest";
import type { IWriteField, EntitySource } from "@speel/core";
import {
  textProperty,
  dateTimeProperty,
  lookupProperty,
  stubEntityType,
} from "@speel/core/testing";
import { SharePointProvider } from "../src/SharePointProvider.js";
import {
  fakePrincipalSp,
  UIL_ADA,
  UIL_GROUP,
  SU_ADA,
  SG_AUDIT,
} from "./fakePrincipalSp.js";

const list = { kind: "title" as const, value: "Projects" };
const principals = { kind: "provider" as const, key: "principals" };
const PRINCIPAL = stubEntityType("Principal", {
  kind: "provider",
  key: "principals",
});
const OWNER = lookupProperty("Owner", PRINCIPAL);
const REVIEWERS = lookupProperty("Reviewers", PRINCIPAL, { multi: true });
const owner = (value: unknown, multi = false): IWriteField => ({
  property: multi ? REVIEWERS : OWNER,
  value,
});
const title: IWriteField = { property: textProperty("Title"), value: "t" };
/** A person column whose target names a key this provider does not serve. */
const mistyped: IWriteField = {
  property: lookupProperty(
    "Owner",
    // The `provider` source kind arrives with step 2 of the principals work.
    stubEntityType("Nope", {
      kind: "provider",
      key: "nope",
    } as unknown as EntitySource),
  ),
  value: 6,
};
/** A UIL row for a principal with no login — the shape that would encode `[{"Key":""}]`. */
const UIL_NOLOGIN = {
  Id: 40,
  Title: "Ghost",
  Name: "",
  ContentTypeId: "0x010A00",
};

function make() {
  const { sp, queries, writes } = fakePrincipalSp({
    uil: [UIL_ADA, UIL_GROUP, UIL_NOLOGIN],
    siteUsers: [SU_ADA],
    siteGroups: [SG_AUDIT],
  });
  return { provider: new SharePointProvider(sp as never), queries, writes };
}
const uilLookups = (queries: { path: string; id?: number }[]) =>
  queries
    .filter((q) => q.path === "siteUserInfoList" && q.id !== undefined)
    .map((q) => q.id);

describe("SharePointProvider insert — root", () => {
  it("posts JSON through items.add, having checked its cold principals against the UIL once", async () => {
    const { provider, queries, writes } = make();
    const [res] = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [
          title,
          owner(6),
          owner([6, 12], true),
          {
            property: dateTimeProperty("When"),
            value: new Date(Date.UTC(2027, 0, 1)),
          },
        ],
        folderServerRelativeUrl: null,
        clientToken: "a",
      },
    ]);
    expect(res).toMatchObject({ kind: "success", serverData: { id: 101 } });
    expect(writes[0]).toMatchObject({
      kind: "add",
      payload: {
        Title: "t",
        OwnerId: 6,
        ReviewersId: [6, 12],
        When: "2027-01-01T00:00:00.000Z",
      },
    });
    // The ids went to SharePoint as ids; the UIL was asked once, for the distinct cold set.
    expect(uilLookups(queries)).toEqual([6, 12]);
  });
  it("resolves nothing for principals the cache already holds", async () => {
    const { provider, queries } = make();
    await provider.getItemsByIdsAsync(
      { kind: "provider", key: "siteUsers" },
      [6],
      ["Id", "LoginName"],
    );
    queries.length = 0;
    const [res] = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, owner(6)],
        folderServerRelativeUrl: null,
        clientToken: "a",
      },
    ]);
    expect(res).toMatchObject({ kind: "success" });
    expect(uilLookups(queries)).toEqual([]);
  });
  it("refuses, unsent, a root insert naming a principal the UIL does not hold — items.add would store a dangling id", async () => {
    const { provider, writes } = make();
    const results = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, owner(999)],
        folderServerRelativeUrl: null,
        clientToken: "bad",
      },
      {
        kind: "insert",
        list,
        fields: [title, owner(6)],
        folderServerRelativeUrl: null,
        clientToken: "ok",
      },
    ]);
    const bad = results.find((r) => r.clientToken === "bad");
    expect(bad).toMatchObject({ kind: "failure", status: 400 });
    expect(String((bad as { body: unknown }).body)).toMatch(
      /999.*Owner|Owner.*999/,
    );
    expect(results.find((r) => r.clientToken === "ok")).toMatchObject({
      kind: "success",
    });
    expect(writes).toHaveLength(1);
  });
  it("refuses, unsent, a root insert whose person column targets a key this provider does not serve — naming the key; the rest of the batch is sent", async () => {
    // Rule 1 on the write side: without this, `{ kind: "provider", key: "typo" }`
    // resolves through the UIL like `principals` and the insert succeeds.
    const { provider, queries, writes } = make();
    const results = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, mistyped],
        folderServerRelativeUrl: null,
        clientToken: "bad",
      },
      {
        kind: "insert",
        list,
        fields: [title],
        folderServerRelativeUrl: null,
        clientToken: "ok",
      },
    ]);
    const bad = results.find((r) => r.clientToken === "bad");
    expect(bad).toMatchObject({ kind: "failure", status: 400 });
    expect(String((bad as { body: unknown }).body)).toMatch(/'nope'/);
    expect(results.find((r) => r.clientToken === "ok")).toMatchObject({
      kind: "success",
    });
    expect(writes).toHaveLength(1);
    // Its ids were never looked up: a field with no served target names nothing to resolve.
    expect(uilLookups(queries)).toEqual([]);
  });
});

describe("SharePointProvider update — typed fields", () => {
  it("encodes fields as items.update JSON: ISO for a Date, null for a clear, keyed by column", async () => {
    const { provider, writes } = make();
    const when = new Date(Date.UTC(2027, 2, 15, 12));
    const [res] = await provider.executeBatchAsync([
      {
        kind: "update",
        list,
        id: 5,
        fields: [
          { property: dateTimeProperty("StartDate"), value: when },
          { property: textProperty("RepoUrl"), value: null },
        ],
        etag: "*",
        clientToken: "u",
      },
    ]);
    expect(res).toEqual({ kind: "success", clientToken: "u" });
    expect(writes).toEqual([
      {
        list: "Projects",
        kind: "update",
        id: 5,
        etag: "*",
        payload: { StartDate: when.toISOString(), RepoUrl: null },
      },
    ]);
  });
  it("validates person ids like a root insert: an unknown principal fails THIS op, unsent; the sibling op is sent", async () => {
    // items.update is the same JSON path that stores a dangling id with a 200 on
    // add (live fact), so the provider checks on update too.
    const { provider, writes } = make();
    const results = await provider.executeBatchAsync([
      {
        kind: "update",
        list,
        id: 5,
        fields: [title, owner(999)],
        etag: "*",
        clientToken: "bad",
      },
      {
        kind: "update",
        list,
        id: 6,
        fields: [title],
        etag: "*",
        clientToken: "ok",
      },
    ]);
    const bad = results.find((r) => r.clientToken === "bad");
    expect(bad).toMatchObject({ kind: "failure", status: 400 });
    expect(String((bad as { body: unknown }).body)).toMatch(
      /999.*Owner|Owner.*999/,
    );
    expect(results.find((r) => r.clientToken === "ok")).toMatchObject({
      kind: "success",
    });
    expect(writes).toEqual([
      {
        list: "Projects",
        kind: "update",
        id: 6,
        etag: "*",
        payload: { Title: "t" },
      },
    ]);
  });
  it("resolves a cold principal through the UIL once, then sends the update with its id", async () => {
    const { provider, queries, writes } = make();
    const [res] = await provider.executeBatchAsync([
      {
        kind: "update",
        list,
        id: 5,
        fields: [owner(6)],
        etag: "*",
        clientToken: "u",
      },
    ]);
    expect(res).toMatchObject({ kind: "success" });
    expect(uilLookups(queries)).toEqual([6]);
    expect(writes[0]).toMatchObject({
      kind: "update",
      payload: { OwnerId: 6 },
    });
  });
  it("resolves nothing for a principal the cache already holds", async () => {
    const { provider, queries } = make();
    await provider.getItemsByIdsAsync(
      { kind: "provider", key: "siteUsers" },
      [6],
      ["Id", "LoginName"],
    );
    queries.length = 0;
    const [res] = await provider.executeBatchAsync([
      {
        kind: "update",
        list,
        id: 5,
        fields: [owner(6)],
        etag: "*",
        clientToken: "u",
      },
    ]);
    expect(res).toMatchObject({ kind: "success" });
    expect(uilLookups(queries)).toEqual([]);
  });
  it("a null single-person clear is sent as OwnerId: null and names no principal — no UIL lookup", async () => {
    const { provider, queries, writes } = make();
    const [res] = await provider.executeBatchAsync([
      {
        kind: "update",
        list,
        id: 5,
        fields: [owner(null)],
        etag: "*",
        clientToken: "u",
      },
    ]);
    expect(res).toMatchObject({ kind: "success" });
    expect(uilLookups(queries)).toEqual([]);
    expect(writes).toEqual([
      {
        list: "Projects",
        kind: "update",
        id: 5,
        etag: "*",
        payload: { OwnerId: null },
      },
    ]);
  });
  it("refuses, unsent, an update whose person column targets a key this provider does not serve — naming the key", async () => {
    const { provider, queries, writes } = make();
    const [res] = await provider.executeBatchAsync([
      {
        kind: "update",
        list,
        id: 5,
        fields: [mistyped],
        etag: "*",
        clientToken: "bad",
      },
    ]);
    expect(res).toMatchObject({ kind: "failure", status: 400 });
    expect(String((res as { body: unknown }).body)).toMatch(/'nope'/);
    expect(writes).toEqual([]);
    expect(uilLookups(queries)).toEqual([]);
  });
});

describe("SharePointProvider insert — folder", () => {
  it("posts form values with claims Keys, resolving cold ids through the UIL once for the whole batch", async () => {
    const { provider, queries, writes } = make();
    const results = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, owner(6)],
        folderServerRelativeUrl: "/s/F",
        clientToken: "a",
      },
      {
        kind: "insert",
        list,
        fields: [title, owner([6, 12], true)],
        folderServerRelativeUrl: "/s/F",
        clientToken: "b",
      },
    ]);
    expect(results.map((r) => r.kind)).toEqual(["success", "success"]);
    expect(uilLookups(queries).sort()).toEqual([12, 6].sort());
    expect(writes[0]).toMatchObject({
      kind: "addValidateUpdateItemUsingPath",
      folder: "/s/F",
      formValues: [
        { FieldName: "Title", FieldValue: "t" },
        {
          FieldName: "Owner",
          FieldValue: '[{"Key":"i:0#.f|membership|ada@x"}]',
        },
      ],
    });
    expect(writes[1]!.formValues![1]).toEqual({
      FieldName: "Reviewers",
      FieldValue: '[{"Key":"i:0#.f|membership|ada@x"},{"Key":"Audit Members"}]',
    });
  });

  it("resolves nothing for a principal a provider-source read returned with its LoginName", async () => {
    const { provider, queries } = make();
    await provider.getItemsByIdsAsync(
      { kind: "provider", key: "siteGroups" },
      [12],
      ["Id", "LoginName"],
    );
    const before = queries.length;
    const [res] = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, owner(12)],
        folderServerRelativeUrl: "/s/F",
        clientToken: "a",
      },
    ]);
    expect(res?.kind).toBe("success");
    expect(uilLookups(queries.slice(before))).toEqual([]);
  });

  it("resolves nothing the second time round", async () => {
    const { provider, queries } = make();
    await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, owner(6)],
        folderServerRelativeUrl: "/s/F",
        clientToken: "a",
      },
    ]);
    const before = queries.length;
    await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, owner(6)],
        folderServerRelativeUrl: "/s/F",
        clientToken: "b",
      },
    ]);
    expect(uilLookups(queries.slice(before))).toEqual([]);
  });

  it("a read that did not select LoginName does not warm the cache", async () => {
    const { provider, queries } = make();
    await provider.getItemsByIdsAsync(principals, [6], ["Id", "Title"]);
    const before = queries.length;
    await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, owner(6)],
        folderServerRelativeUrl: "/s/F",
        clientToken: "a",
      },
    ]);
    expect(uilLookups(queries.slice(before))).toEqual([6]);
  });

  // The include route: core's `.include()` over a person navigation is an
  // itemsByIds read on the `principals` source — the same UIL rows, in model
  // spelling, through either entry point. A save that follows it must resolve
  // nothing, like one that follows any other provider-source read.
  const PRINCIPAL_SELECT = ["Id", "Title", "LoginName", "PrincipalType"];

  it("resolves nothing for a principal the include route returned with its LoginName (by-ids entry point)", async () => {
    const { provider, queries } = make();
    await provider.getItemsByIdsAsync(principals, [6], PRINCIPAL_SELECT);
    const before = queries.length;
    const [res] = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, owner(6)],
        folderServerRelativeUrl: "/s/F",
        clientToken: "a",
      },
    ]);
    expect(res?.kind).toBe("success");
    expect(uilLookups(queries.slice(before))).toEqual([]);
  });

  it("resolves nothing for a principal a batched include read returned with its LoginName", async () => {
    const { provider, queries } = make();
    const [read] = await provider.executeReadBatchAsync!([
      {
        kind: "itemsByIds",
        source: principals,
        ids: [12],
        fields: PRINCIPAL_SELECT,
        clientToken: "u",
      },
    ]);
    expect(read?.items.map((r) => r.Id)).toEqual([12]);
    const before = queries.length;
    const [res] = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, owner(12)],
        folderServerRelativeUrl: "/s/F",
        clientToken: "a",
      },
    ]);
    expect(res?.kind).toBe("success");
    expect(uilLookups(queries.slice(before))).toEqual([]);
  });

  it("a UIL row with an empty login warms nothing: the insert still resolves, and still fails on the empty login", async () => {
    const { provider, queries } = make();
    await provider.getItemsByIdsAsync(principals, [40], PRINCIPAL_SELECT);
    const before = queries.length;
    const [res] = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, owner(40)],
        folderServerRelativeUrl: "/s/F",
        clientToken: "a",
      },
    ]);
    expect(uilLookups(queries.slice(before))).toEqual([40]);
    expect(res?.kind).toBe("failure");
  });

  it("fails only the operation naming an unresolvable principal; the rest of the batch proceeds", async () => {
    const { provider, writes } = make();
    const results = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, owner(999)],
        folderServerRelativeUrl: "/s/F",
        clientToken: "bad",
      },
      {
        kind: "insert",
        list,
        fields: [title, owner(40)],
        folderServerRelativeUrl: "/s/F",
        clientToken: "empty",
      },
      {
        kind: "insert",
        list,
        fields: [title],
        folderServerRelativeUrl: "/s/F",
        clientToken: "ok",
      },
    ]);
    expect(results.find((r) => r.clientToken === "bad")).toMatchObject({
      kind: "failure",
      status: 400,
    });
    expect(
      String(
        (results.find((r) => r.clientToken === "bad") as { body: unknown })
          .body,
      ),
    ).toMatch(/999.*Owner|Owner.*999/);
    expect(results.find((r) => r.clientToken === "empty")).toMatchObject({
      kind: "failure",
      status: 400,
    });
    expect(results.find((r) => r.clientToken === "ok")).toMatchObject({
      kind: "success",
    });
    expect(writes).toHaveLength(1);
  });

  it("refuses, unsent, a folder insert whose person column targets a key this provider does not serve — naming the key; the rest of the batch is sent", async () => {
    const { provider, writes } = make();
    const results = await provider.executeBatchAsync([
      {
        kind: "insert",
        list,
        fields: [title, mistyped],
        folderServerRelativeUrl: "/s/F",
        clientToken: "bad",
      },
      {
        kind: "insert",
        list,
        fields: [title, owner(6)],
        folderServerRelativeUrl: "/s/F",
        clientToken: "ok",
      },
    ]);
    const bad = results.find((r) => r.clientToken === "bad");
    expect(bad).toMatchObject({ kind: "failure", status: 400 });
    expect(String((bad as { body: unknown }).body)).toMatch(/'nope'/);
    expect(results.find((r) => r.clientToken === "ok")).toMatchObject({
      kind: "success",
    });
    expect(writes).toHaveLength(1);
  });
});

describe("SharePointProvider uploadFileAsync with typed fields", () => {
  const lib = { kind: "title" as const, value: "Docs" };
  it("encodes fields as the item's metadata, resolving principals before the bytes move", async () => {
    const { provider, writes } = make();
    await provider.uploadFileAsync(lib, "/s/Docs", {
      fileName: "a.txt",
      content: "x",
      overwrite: true,
      fields: [title, owner(6)],
    });
    expect(writes.map((w) => w.kind)).toEqual([
      "addUsingPath",
      "validateUpdateListItem",
    ]);
    expect(writes[1]!.formValues).toEqual([
      { FieldName: "Title", FieldValue: "t" },
      { FieldName: "Owner", FieldValue: '[{"Key":"i:0#.f|membership|ada@x"}]' },
    ]);
  });
  it("an unresolvable principal throws before anything is uploaded", async () => {
    const { provider, writes } = make();
    await expect(
      provider.uploadFileAsync(lib, "/s/Docs", {
        fileName: "a.txt",
        content: "x",
        overwrite: true,
        fields: [owner(999)],
      }),
    ).rejects.toThrow(/999/);
    expect(writes).toEqual([]);
  });
  it("a person column targeting a key this provider does not serve throws before anything is uploaded, naming the key", async () => {
    const { provider, writes } = make();
    await expect(
      provider.uploadFileAsync(lib, "/s/Docs", {
        fileName: "a.txt",
        content: "x",
        overwrite: true,
        fields: [title, mistyped],
      }),
    ).rejects.toThrow(/'nope'/);
    expect(writes).toEqual([]);
  });
  it("no fields applies no metadata: the upload alone, no validateUpdateListItem", async () => {
    const { provider, writes } = make();
    await provider.uploadFileAsync(lib, "/s/Docs", {
      fileName: "c.txt",
      content: "x",
      overwrite: true,
    });
    expect(writes.map((w) => w.kind)).toEqual(["addUsingPath"]);
  });
});
