// test/SharePointProvider.pathSelect.test.ts
import { describe, it, expect } from "vitest";
import { SharePointProvider } from "../src/SharePointProvider.js";

// Records the $select and $expand args the provider passes to PnPjs for a paged read.
// `expand` is only reached when the provider decides there is something to expand, so
// an untouched `expands` means no $expand was emitted at all.
function recordingSp(captured: { selects?: string[]; expands?: string[] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    filter: (_s: string) => chain,
    top: (_n: number) => ({
      [Symbol.asyncIterator]() {
        let done = false;
        return {
          async next() {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: [] };
          },
        };
      },
    }),
    expand: (...e: string[]) => {
      captured.expands = e;
      return chain;
    },
  };
  const items = {
    select: (...s: string[]) => {
      captured.selects = s;
      return chain;
    },
  };
  return {
    web: {
      lists: { getByTitle: () => ({ items }), getById: () => ({ items }) },
    },
  };
}

const list = { kind: "title" as const, value: "Reports" };

describe("SharePointProvider path-shaped $select", () => {
  it("derives \\$expand=File from a 'File/Length' column, with no expand clause passed", async () => {
    const captured: { selects?: string[]; expands?: string[] } = {};
    const provider = new SharePointProvider(recordingSp(captured) as never);
    await provider.getItemsPagedAsync(
      list,
      ["ID", "Title", "FileLeafRef", "File/Length"],
      50,
    );

    expect(captured.selects).toEqual([
      "ID",
      "Title",
      "FileLeafRef",
      "File/Length",
    ]);
    expect(captured.expands).toEqual(["File"]);
  });

  it("emits no $expand for a plain (non-document) column set", async () => {
    const captured: { selects?: string[]; expands?: string[] } = {};
    const provider = new SharePointProvider(recordingSp(captured) as never);
    await provider.getItemsPagedAsync(list, ["ID", "Title", "FSObjType"], 50);

    expect(captured.selects).toEqual(["ID", "Title", "FSObjType"]);
    expect(captured.expands).toBeUndefined();
  });

  it("does not duplicate a nav an expand clause already declared", async () => {
    const captured: { selects?: string[]; expands?: string[] } = {};
    const provider = new SharePointProvider(recordingSp(captured) as never);
    await provider.getItemsPagedAsync(
      list,
      ["ID", "File/Length"],
      50,
      undefined,
      {
        expand: [{ navColumn: "File", selectFields: ["Name"] }],
      },
    );

    expect(captured.expands).toEqual(["File"]);
    expect(captured.selects).toEqual(["ID", "File/Length", "File/Name"]);
  });
});
