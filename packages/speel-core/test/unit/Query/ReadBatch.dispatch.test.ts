// One read descriptor → one provider read, drained. This is both the
// no-capability fallback unit and the fake's own executeReadBatchAsync body,
// so it is the place the descriptor union's semantics are pinned down.
import { describe, it, expect } from "vitest";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { dispatchReadOperation } from "../../../src/Query/ReadBatch.js";
import type { IListHandle } from "../../../src/types.js";

const blogs: IListHandle = { kind: "title", value: "Blogs" };

function seed(provider: FakeStorageProvider, count: number): void {
  for (let i = 0; i < count; i++) {
    provider.seedRow(blogs, { Title: `Blog ${i + 1}` });
  }
}

describe("dispatchReadOperation", () => {
  it("reads items by id and drops missing ones", async () => {
    const provider = new FakeStorageProvider();
    seed(provider, 3);

    const items = await dispatchReadOperation(provider, {
      kind: "itemsByIds",
      source: blogs,
      ids: [1, 3, 99],
      fields: ["Id", "Title"],
      clientToken: "r0",
    });

    // A positional null carries no information — apply-side grouping keys off each
    // record's own Id — so missing ids are dropped rather than preserved as holes.
    expect(items.map((i) => i.Title)).toEqual(["Blog 1", "Blog 3"]);
  });

  it("drains every page of a filtered read, not just the first", async () => {
    const provider = new FakeStorageProvider();
    seed(provider, 25);

    const items = await dispatchReadOperation(provider, {
      kind: "items",
      source: blogs,
      fields: ["Id", "Title"],
      pageSize: 10,
      clientToken: "r0",
    });

    expect(items.length).toBe(25);
  });

  it("reads principals by id through the provider source, like any itemsByIds", async () => {
    const provider = new FakeStorageProvider();
    provider.seedPrincipal({
      Id: 7,
      Title: "Ada",
      LoginName: "i:0#.f|m|ada",
      PrincipalType: 1,
    });

    const items = await dispatchReadOperation(provider, {
      kind: "itemsByIds",
      source: { kind: "provider", key: "principals" },
      ids: [7, 99],
      fields: ["Id", "Title"],
      clientToken: "r0",
    });

    // The missing id is dropped, not nulled — the apply side keys by Id.
    expect(items).toEqual([{ Id: 7, Title: "Ada" }]);
  });
});

describe("FakeStorageProvider.executeReadBatchAsync", () => {
  it("returns one complete result per operation, keyed by clientToken", async () => {
    const provider = new FakeStorageProvider();
    seed(provider, 25);

    const results = await provider.executeReadBatchAsync([
      {
        kind: "itemsByIds",
        source: blogs,
        ids: [2],
        fields: ["Id", "Title"],
        clientToken: "a",
      },
      {
        kind: "items",
        source: blogs,
        fields: ["Id", "Title"],
        pageSize: 10,
        clientToken: "b",
      },
    ]);

    expect(results.map((r) => r.clientToken)).toEqual(["a", "b"]);
    expect(results[0]!.items.length).toBe(1);
    // Complete, not one page: the contract promises every matching row.
    expect(results[1]!.items.length).toBe(25);
  });
});
