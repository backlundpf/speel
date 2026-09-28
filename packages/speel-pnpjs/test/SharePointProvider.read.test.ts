// test/SharePointProvider.read.test.ts
import { describe, it, expect } from "vitest";
import { SharePointProvider } from "../src/SharePointProvider.js";

function fakeList(items: Record<string, unknown>[]) {
  const itemsApi = {
    getById: (id: number) => ({
      // PnPjs v4 queryables are invoked by calling the object (no .get()).
      select: () => {
        const fn: any = () => {
          const found = items.find((r) => r["ID"] === id);
          if (!found) return Promise.reject({ status: 404 });
          return Promise.resolve(found);
        };
        return fn;
      },
    }),
    select: (..._cols: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        filter: (_s: string) => chain,
        top: (n: number) => ({
          [Symbol.asyncIterator]() {
            let offset = 0;
            return {
              async next() {
                if (offset >= items.length)
                  return { done: true, value: undefined };
                const chunk = items.slice(offset, offset + n);
                offset += n;
                return { done: false, value: chunk };
              },
            };
          },
        }),
      };
      return chain;
    },
  };
  return {
    items: itemsApi,
  };
}

function fakeSp(list: ReturnType<typeof fakeList>) {
  return {
    web: {
      lists: {
        getByTitle: () => list,
        getById: () => list,
      },
    },
  };
}

describe("SharePointProvider read", () => {
  it("getItemByIdAsync returns the selected fields", async () => {
    const sp = fakeSp(
      fakeList([
        { ID: 1, Title: "A" },
        { ID: 2, Title: "B" },
      ]),
    );
    const provider = new SharePointProvider(sp as never);
    const item = await provider.getItemByIdAsync(
      { kind: "title", value: "Blogs" },
      1,
      ["Title"],
    );
    expect(item).toEqual({ ID: 1, Title: "A" });
  });

  it("getItemByIdAsync returns null on 404", async () => {
    const sp = fakeSp(fakeList([]));
    const provider = new SharePointProvider(sp as never);
    expect(
      await provider.getItemByIdAsync({ kind: "title", value: "Blogs" }, 99, [
        "Title",
      ]),
    ).toBeNull();
  });

  it("getItemsPagedAsync drives the async iterator one page at a time", async () => {
    const sp = fakeSp(fakeList([{ ID: 1 }, { ID: 2 }, { ID: 3 }]));
    const provider = new SharePointProvider(sp as never);
    const p = await provider.getItemsPagedAsync(
      { kind: "title", value: "Blogs" },
      ["ID"],
      2,
    );
    expect(p.items.length).toBe(2);
    expect(p.nextCursor).not.toBeNull();
  });
});
