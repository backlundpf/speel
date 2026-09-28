import { describe, it, expect, beforeEach } from "vitest";
import { FakeStorageProvider } from "./FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";
import type { FilterNode } from "../../../src/Query/FilterNode.js";

const blogs: IListHandle = { kind: "title", value: "Blogs" };
const users: IListHandle = { kind: "title", value: "UserInfo" };

describe("FakeStorageProvider — navigation extensions", () => {
  let provider: FakeStorageProvider;
  beforeEach(async () => {
    provider = new FakeStorageProvider();
    // seed users
    for (let i = 0; i < 3; i++) {
      provider.seedRow(users, {
        Title: `User ${i + 1}`,
        Email: `u${i + 1}@x.com`,
      });
    }
    // seed blogs
    for (let i = 0; i < 3; i++) {
      provider.seedRow(blogs, {
        Title: `Blog ${i + 1}`,
        AuthorId: (i % 2) + 1,
      });
    }
    // Register cross-list join so expand can resolve Author/Title.
    provider.registerJoin(blogs, "Author", {
      foreignKey: "AuthorId",
      targetList: users,
    });
  });

  it("getItemsByIdsAsync returns aligned results, null on miss", async () => {
    const r = await provider.getItemsByIdsAsync(
      users,
      [1, 999, 2],
      ["ID", "Title"],
    );
    expect(r.length).toBe(3);
    expect((r[0] as Record<string, unknown>).Title).toBe("User 1");
    expect(r[1]).toBeNull();
    expect((r[2] as Record<string, unknown>).Title).toBe("User 2");
  });

  it("getItemsPagedAsync expand attaches sub-record", async () => {
    const r = await provider.getItemsPagedAsync(
      blogs,
      ["ID", "Title", "AuthorId"],
      100,
      undefined,
      { expand: [{ navColumn: "Author", selectFields: ["Title"] }] },
    );
    const blog1 = r.items.find((b) => b.ID === 1) as Record<string, unknown>;
    expect((blog1.Author as { Title: string }).Title).toBe("User 1");
  });

  it("evaluateFilter resolves slash-path Author/Title against expanded record", async () => {
    const filter: FilterNode = {
      kind: "compare",
      column: "Author/Title",
      op: "eq",
      value: "User 1",
    };
    const r = await provider.getItemsPagedAsync(
      blogs,
      ["ID", "Title"],
      100,
      undefined,
      { expand: [{ navColumn: "Author", selectFields: ["Title"] }], filter },
    );
    expect(r.items.length).toBe(2);
    expect(r.items.every((b) => (b.ID as number) % 2 === 1)).toBe(true);
  });
});
