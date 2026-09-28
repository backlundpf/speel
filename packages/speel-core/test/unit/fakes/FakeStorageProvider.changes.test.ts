import { describe, it, expect } from "vitest";
import { FakeStorageProvider } from "./FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";

const LIST: IListHandle = { kind: "title", value: "Projects" };

function add(p: FakeStorageProvider, title: string): number {
  return p.seedRow(LIST, { Title: title });
}

describe("FakeStorageProvider.getListItemChangesSinceToken", () => {
  it("empty token returns all items, no deletes, and a token", async () => {
    const p = new FakeStorageProvider();
    add(p, "A");
    add(p, "B");
    const res = await p.getListItemChangesSinceToken(LIST, "", ["Title"]);
    expect(res.changed.map((r) => r.Title).sort()).toEqual(["A", "B"]);
    expect(res.deletedIds).toEqual([]);
    expect(res.newToken).not.toBe("");
  });

  it("delta returns only items changed since the token", async () => {
    const p = new FakeStorageProvider();
    add(p, "A");
    const first = await p.getListItemChangesSinceToken(LIST, "", ["Title"]);
    const idB = add(p, "B"); // change after the token
    const delta = await p.getListItemChangesSinceToken(LIST, first.newToken, [
      "Title",
    ]);
    expect(delta.changed.map((r) => r.ID)).toEqual([idB]);
    expect(delta.deletedIds).toEqual([]);
  });

  it("delta reports deleted Ids since the token", async () => {
    const p = new FakeStorageProvider();
    const idA = add(p, "A");
    add(p, "B");
    const first = await p.getListItemChangesSinceToken(LIST, "", ["Title"]);
    await p.executeBatchAsync([
      {
        kind: "delete",
        list: LIST,
        id: idA,
        etag: "*",
        permanent: false,
        clientToken: "d",
      },
    ]);
    const delta = await p.getListItemChangesSinceToken(LIST, first.newToken, [
      "Title",
    ]);
    expect(delta.deletedIds).toEqual([idA]);
    expect(delta.changed).toEqual([]);
  });

  it("applies expand joins to changed rows", async () => {
    const p = new FakeStorageProvider();
    const users: IListHandle = { kind: "title", value: "UserInfo" };
    p.seedRow(users, { Title: "Ada" });
    p.registerJoin(LIST, "Owner", { foreignKey: "OwnerId", targetList: users });
    p.seedRow(LIST, { Title: "A", OwnerId: 1 });
    const res = await p.getListItemChangesSinceToken(
      LIST,
      "",
      ["Title", "OwnerId"],
      [{ navColumn: "Owner", selectFields: ["Title"] }],
    );
    expect((res.changed[0]!.Owner as { Title: string }).Title).toBe("Ada");
  });
});
