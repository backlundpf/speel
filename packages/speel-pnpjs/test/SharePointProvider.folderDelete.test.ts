// test/SharePointProvider.folderDelete.test.ts
import { describe, it, expect } from "vitest";
import { SharePointProvider } from "../src/SharePointProvider.js";

const list = { kind: "title" as const, value: "Docs" };

/** Fake spfi recording which folder was asked for and how it was disposed of. */
function fakeSp(opts?: { recycleError?: unknown }) {
  const calls: {
    folderRequests: string[];
    recycles: string[];
    deletes: string[];
  } = { folderRequests: [], recycles: [], deletes: [] };

  const makeList = () => ({
    rootFolder: {
      select: (_f: string) => async () => ({
        ServerRelativeUrl: "/sites/dev/Docs",
      }),
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sp2: any = {
    web: {
      lists: { getByTitle: makeList, getById: makeList },
      getFolderByServerRelativePath: (src: string) => {
        calls.folderRequests.push(src);
        return {
          recycle: () => {
            calls.recycles.push(src);
            if (opts?.recycleError) return Promise.reject(opts.recycleError);
            return Promise.resolve("recycle-bin-id");
          },
          delete: () => {
            calls.deletes.push(src);
            return Promise.resolve();
          },
        };
      },
    },
    batched() {
      return [sp2, async () => undefined];
    },
  };

  return { sp2, calls };
}

describe("SharePointProvider.deleteFolderAsync", () => {
  it("resolves the list root, then recycles the folder", async () => {
    const { sp2, calls } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    await provider.deleteFolderAsync(list, "responses/r-1");
    expect(calls.folderRequests).toEqual(["/sites/dev/Docs/responses/r-1"]);
    expect(calls.recycles).toEqual(["/sites/dev/Docs/responses/r-1"]);
  });

  it("recycles rather than hard-deletes, matching the item delete default", async () => {
    const { sp2, calls } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    await provider.deleteFolderAsync(list, "a");
    expect(calls.recycles).toEqual(["/sites/dev/Docs/a"]);
    expect(calls.deletes).toEqual([]);
  });

  it("propagates a recycle failure", async () => {
    const { sp2 } = fakeSp({
      recycleError: { status: 404, message: "File Not Found." },
    });
    const provider = new SharePointProvider(sp2 as never);
    await expect(provider.deleteFolderAsync(list, "a")).rejects.toMatchObject({
      message: "File Not Found.",
    });
  });
});
