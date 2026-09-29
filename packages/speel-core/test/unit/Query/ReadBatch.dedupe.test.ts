// Two navigations at the same include level can plan reads against the same target —
// two person fields, two lookups into the same list. dedupeReadOperations union-merges
// those into one request per unique target, so the batch never asks the backend for the
// same records twice. Filter-based `items` reads are NOT merged: their in-filter chunks
// are provider-budgeted per navigation.
import { describe, it, expect } from "vitest";
import { dedupeReadOperations } from "../../../src/Query/ReadBatch.js";
import type { IReadOperation } from "../../../src/providers/ISharePointProvider.js";
import type { IListHandle } from "../../../src/types.js";

const authors: IListHandle = { kind: "title", value: "Authors" };
const blogs: IListHandle = { kind: "title", value: "Blogs" };

function byIds(
  token: string,
  list: IListHandle,
  ids: number[],
  fields: string[] = ["Id", "Name"],
): Extract<IReadOperation, { kind: "itemsByIds" }> {
  return { kind: "itemsByIds", source: list, ids, fields, clientToken: token };
}

describe("dedupeReadOperations", () => {
  it("union-merges itemsByIds ops on the same list and fields", () => {
    const { ops, remap } = dedupeReadOperations([
      byIds("r0", authors, [1, 2]),
      byIds("r1", authors, [2, 3]),
    ]);

    expect(ops).toEqual([byIds("r0", authors, [1, 2, 3])]);
    expect(remap.get("r1")).toBe("r0");
  });

  it("keeps itemsByIds ops on different lists separate", () => {
    const input = [byIds("r0", authors, [1]), byIds("r1", blogs, [1])];
    const { ops, remap } = dedupeReadOperations(input);

    expect(ops).toEqual(input);
    expect(remap.size).toBe(0);
  });

  it("keeps itemsByIds ops with different fields separate", () => {
    const input = [
      byIds("r0", authors, [1], ["Id", "Name"]),
      byIds("r1", authors, [1], ["Id", "Title"]),
    ];
    expect(dedupeReadOperations(input).ops).toEqual(input);
  });

  it("keeps itemsByIds ops with different expands separate", () => {
    const plain = byIds("r0", authors, [1]);
    const expanded: IReadOperation = {
      ...byIds("r1", authors, [1]),
      expand: [{ navColumn: "Editor", selectFields: ["Id"] }],
    };
    expect(dedupeReadOperations([plain, expanded]).ops).toEqual([
      plain,
      expanded,
    ]);
  });

  it("union-merges itemsByIds ops on the same provider source and fields", () => {
    const principals = { kind: "provider", key: "principals" } as const;
    const a: IReadOperation = {
      kind: "itemsByIds",
      source: principals,
      ids: [7, 8],
      fields: ["Id", "Title"],
      clientToken: "r0",
    };
    const b: IReadOperation = {
      kind: "itemsByIds",
      source: principals,
      ids: [8, 9],
      fields: ["Id", "Title"],
      clientToken: "r1",
    };
    const { ops, remap } = dedupeReadOperations([a, b]);

    expect(ops).toEqual([{ ...a, ids: [7, 8, 9] }]);
    expect(remap.get("r1")).toBe("r0");
  });

  it("never merges filter-based items ops, even identical ones", () => {
    const op = (token: string): IReadOperation => ({
      kind: "items",
      source: blogs,
      fields: ["Id"],
      pageSize: 1000,
      options: {
        filter: { kind: "in", column: "AId", values: [1], negate: false },
      },
      clientToken: token,
    });
    const input = [op("r0"), op("r1")];
    const { ops, remap } = dedupeReadOperations(input);

    expect(ops).toEqual(input);
    expect(remap.size).toBe(0);
  });
});
