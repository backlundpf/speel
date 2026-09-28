// test/SharePointProvider.changes.test.ts
import { describe, it, expect } from "vitest";
import { SharePointProvider } from "../src/SharePointProvider.js";
import type { IListHandle } from "@speel/core";

const LIST: IListHandle = { kind: "title", value: "Projects" };

// A structural SPFI stub matching the loose shape SharePointProvider uses.
// `getListItemChangesSinceToken` returns the change-feed XML (carrying the
// advancing LastChangeToken and any deletions); `list.items...` is the
// changed-rows query.
function stub(opts: { changesXml: string; items: Record<string, unknown>[] }) {
  const calls = {
    filter: undefined as string | undefined,
    changeQuery: undefined as Record<string, unknown> | undefined,
  };
  const builder: any = {
    select: () => builder,
    expand: () => builder,
    filter: (s: string) => {
      calls.filter = s;
      return builder;
    },
    top: () => builder,
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        async next() {
          if (done) return { done: true, value: undefined };
          done = true;
          return { done: false, value: opts.items };
        },
      };
    },
  };
  const list: any = {
    items: builder,
    getListItemChangesSinceToken: (q: Record<string, unknown>) => {
      calls.changeQuery = q;
      return Promise.resolve(opts.changesXml);
    },
  };
  const sp = {
    web: { lists: { getByTitle: () => list, getById: () => list } },
    batched: () => [sp, async () => undefined],
  };
  return { sp, calls };
}

describe("SharePointProvider.getListItemChangesSinceToken", () => {
  it("delta: returns Modified-ge items as changed, parsed deletes, and the feed token", async () => {
    const xml = `<listitems><Changes LastChangeToken="1;3;g;638400000000000000;9"><Id ChangeType="Delete">42</Id></Changes></listitems>`;
    const { sp, calls } = stub({
      changesXml: xml,
      items: [{ ID: 5, Title: "X" }],
    });
    const provider = new SharePointProvider(sp as never);
    const res = await provider.getListItemChangesSinceToken(
      LIST,
      "1;3;g;638396640000000000;1",
      ["Title"],
    );
    expect(res.changed).toEqual([{ ID: 5, Title: "X" }]);
    expect(res.deletedIds).toEqual([42]);
    expect(res.newToken).toBe("1;3;g;638400000000000000;9");
    expect(calls.filter).toMatch(/^Modified ge '/); // ISO time derived from the prior token
    // The change-log query members must be primitive strings (not objects).
    expect(calls.changeQuery).toMatchObject({
      ChangeToken: "1;3;g;638396640000000000;1",
      RowLimit: "5000",
    });
  });

  it("delta with an unchanged token skips the Modified-ge query and returns no changes", async () => {
    const sameToken = "1;3;g;638396640000000000;1";
    const xml = `<listitems><Changes LastChangeToken="${sameToken}"></Changes></listitems>`;
    const { sp, calls } = stub({ changesXml: xml, items: [{ ID: 9 }] });
    const provider = new SharePointProvider(sp as never);
    const res = await provider.getListItemChangesSinceToken(LIST, sameToken, [
      "Title",
    ]);
    expect(res.newToken).toBe(sameToken);
    expect(res.changed).toEqual([]); // items query skipped
    expect(res.deletedIds).toEqual([]);
    expect(calls.filter).toBeUndefined(); // Modified-ge filter never built
  });

  it("empty token: returns all items as changed, no deletes, and the current feed token", async () => {
    const xml = `<listitems><Changes LastChangeToken="1;3;g;638400000000000000;9"></Changes></listitems>`;
    const { sp, calls } = stub({
      changesXml: xml,
      items: [{ ID: 1 }, { ID: 2 }],
    });
    const provider = new SharePointProvider(sp as never);
    const res = await provider.getListItemChangesSinceToken(LIST, "", [
      "Title",
    ]);
    expect(res.changed.map((r) => r.ID)).toEqual([1, 2]);
    expect(res.deletedIds).toEqual([]);
    expect(res.newToken).toBe("1;3;g;638400000000000000;9");
    expect(calls.filter).toBeUndefined(); // first load fetches all items, no Modified filter
    // First load still reads the feed (no ChangeToken) to capture the token.
    expect(calls.changeQuery).toBeDefined();
    expect(
      (calls.changeQuery as Record<string, unknown>).ChangeToken,
    ).toBeUndefined();
    expect((calls.changeQuery as Record<string, unknown>).RowLimit).toBe("1");
  });
});
