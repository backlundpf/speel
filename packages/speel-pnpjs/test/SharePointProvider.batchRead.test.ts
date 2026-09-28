// test/SharePointProvider.batchRead.test.ts
import { describe, it, expect } from "vitest";
import { SharePointProvider } from "../src/SharePointProvider.js";
import type { IListHandle } from "@speel/core";

function fakeSpfi(records: Record<number, Record<string, unknown>>) {
  const batchCalls: {
    id: number;
    selectArgs: string[];
    expandArgs: string[];
  }[] = [];
  const execCalls: number[] = [];
  let batchCounter = 0;

  const buildSelectExpandableItem = (id: number) => {
    const state = { selectArgs: [] as string[], expandArgs: [] as string[] };
    // PnPjs v4 queryables are invoked by calling the object (no .get()), so
    // `item` is a callable with `.select` / `.expand` attached.
    const item: any = async () => {
      if (!(id in records)) {
        const err = new Error("not found") as Error & { status: number };
        err.status = 404;
        throw err;
      }
      batchCalls.push({
        id,
        selectArgs: state.selectArgs,
        expandArgs: state.expandArgs,
      });
      return records[id]!;
    };
    item.select = (...fields: string[]) => {
      state.selectArgs.push(...fields);
      return item;
    };
    item.expand = (...navs: string[]) => {
      state.expandArgs.push(...navs);
      return item;
    };
    return item;
  };
  const items = {
    getById: (id: number) => buildSelectExpandableItem(id),
  };
  const list = { items };
  const sp = {
    web: {
      lists: {
        getByTitle: () => list,
        getById: () => list,
      },
    },
    batched: () => {
      batchCounter++;
      return [
        sp as unknown,
        async () => {
          execCalls.push(batchCounter);
        },
      ] as const;
    },
  };
  return { sp, batchCalls, execCalls };
}

const userList: IListHandle = { kind: "title", value: "UserInfo" };

describe("SharePointProvider.getItemsByIdsAsync", () => {
  it("issues a single $batch and returns aligned results (null on 404)", async () => {
    const { sp, batchCalls, execCalls } = fakeSpfi({
      1: { ID: 1, Title: "A" },
      3: { ID: 3, Title: "C" },
    });
    const provider = new SharePointProvider(sp as any);
    const r = await provider.getItemsByIdsAsync(
      userList,
      [1, 2, 3],
      ["ID", "Title"],
    );
    expect(r.length).toBe(3);
    expect((r[0] as Record<string, unknown>).Title).toBe("A");
    expect(r[1]).toBeNull();
    expect((r[2] as Record<string, unknown>).Title).toBe("C");
    expect(execCalls.length).toBe(1);
    expect(batchCalls.length).toBe(2);
  });

  it("chunks at 100 ids per $batch", async () => {
    const records: Record<number, Record<string, unknown>> = {};
    for (let i = 1; i <= 250; i++) records[i] = { ID: i, Title: `T${i}` };
    const { sp, execCalls } = fakeSpfi(records);
    const provider = new SharePointProvider(sp as any);
    const ids = Array.from({ length: 250 }, (_, i) => i + 1);
    const r = await provider.getItemsByIdsAsync(userList, ids, ["ID", "Title"]);
    expect(r.length).toBe(250);
    expect(execCalls.length).toBe(3); // 100 + 100 + 50
  });

  it("forwards expand to .select and .expand", async () => {
    const { sp, batchCalls } = fakeSpfi({
      1: { ID: 1, Title: "A", Author: { Title: "Z" } },
    });
    const provider = new SharePointProvider(sp as any);
    await provider.getItemsByIdsAsync(userList, [1], ["ID", "Title"], {
      expand: [{ navColumn: "Author", selectFields: ["Title"] }],
    });
    expect(batchCalls[0]!.expandArgs).toContain("Author");
    expect(batchCalls[0]!.selectArgs).toContain("Author/Title");
  });
});
