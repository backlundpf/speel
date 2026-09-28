// test/SharePointProvider.rename.test.ts
import { describe, it, expect } from "vitest";
import { SharePointProvider } from "../src/SharePointProvider.js";

const list = { kind: "title" as const, value: "Docs" };

interface RenameCalls {
  itemSelects: { id: number; fields: string[] }[];
  fileRequests: string[];
  fileMoves: { src: string; dest: string; overwrite: boolean }[];
  folderRequests: string[];
  folderMoves: { src: string; dest: string }[];
}

/**
 * Fake spfi for the rename ops. `fileRef` is what the item read returns for
 * FileRef (undefined models a row with no file behind it).
 */
function fakeSp(opts?: { fileRef?: string | undefined; moveError?: unknown }) {
  const calls: RenameCalls = {
    itemSelects: [],
    fileRequests: [],
    fileMoves: [],
    folderRequests: [],
    folderMoves: [],
  };

  const makeList = () => ({
    items: {
      getById: (id: number) => ({
        select: (...fields: string[]) => {
          calls.itemSelects.push({ id, fields });
          return async () =>
            "fileRef" in (opts ?? {})
              ? { FileRef: opts?.fileRef }
              : { FileRef: "/sites/dev/Docs/a/q2.pdf" };
        },
      }),
    },
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
      getFileByServerRelativePath: (src: string) => {
        calls.fileRequests.push(src);
        return {
          moveByPath: (dest: string, overwrite: boolean) => {
            calls.fileMoves.push({ src, dest, overwrite });
            if (opts?.moveError) return Promise.reject(opts.moveError);
            return Promise.resolve({});
          },
        };
      },
      getFolderByServerRelativePath: (src: string) => {
        calls.folderRequests.push(src);
        return {
          moveByPath: (dest: string) => {
            calls.folderMoves.push({ src, dest });
            if (opts?.moveError) return Promise.reject(opts.moveError);
            return Promise.resolve({});
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

describe("SharePointProvider.renameFileAsync", () => {
  it("resolves the item's FileRef and moves it to a sibling path, no overwrite", async () => {
    const { sp2, calls } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    const res = await provider.renameFileAsync(list, 7, "q2-final.pdf");
    expect(calls.itemSelects).toEqual([{ id: 7, fields: ["FileRef"] }]);
    expect(calls.fileRequests).toEqual(["/sites/dev/Docs/a/q2.pdf"]);
    expect(calls.fileMoves).toEqual([
      {
        src: "/sites/dev/Docs/a/q2.pdf",
        dest: "/sites/dev/Docs/a/q2-final.pdf",
        overwrite: false,
      },
    ]);
    expect(res).toEqual({
      name: "q2-final.pdf",
      serverRelativeUrl: "/sites/dev/Docs/a/q2-final.pdf",
    });
  });

  it("throws — without moving anything — when the item has no FileRef", async () => {
    const { sp2, calls } = fakeSp({ fileRef: undefined });
    const provider = new SharePointProvider(sp2 as never);
    await expect(provider.renameFileAsync(list, 7, "x.pdf")).rejects.toThrow(
      /FileRef/,
    );
    expect(calls.fileMoves).toHaveLength(0);
  });

  it("propagates a move failure (e.g. a destination collision)", async () => {
    const { sp2 } = fakeSp({
      moveError: {
        status: 400,
        message: "A file with the name already exists",
      },
    });
    const provider = new SharePointProvider(sp2 as never);
    await expect(
      provider.renameFileAsync(list, 7, "x.pdf"),
    ).rejects.toMatchObject({ message: "A file with the name already exists" });
  });
});

describe("SharePointProvider.renameFolderAsync", () => {
  it("resolves the list root, then moves the folder to a sibling path", async () => {
    const { sp2, calls } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    const res = await provider.renameFolderAsync(
      list,
      "responses/r-1",
      "r-1-final",
    );
    expect(calls.folderRequests).toEqual(["/sites/dev/Docs/responses/r-1"]);
    expect(calls.folderMoves).toEqual([
      {
        src: "/sites/dev/Docs/responses/r-1",
        dest: "/sites/dev/Docs/responses/r-1-final",
      },
    ]);
    expect(res).toEqual({
      name: "r-1-final",
      serverRelativeUrl: "/sites/dev/Docs/responses/r-1-final",
    });
  });

  it("renames a top-level folder against the list root", async () => {
    const { sp2, calls } = fakeSp();
    const provider = new SharePointProvider(sp2 as never);
    await provider.renameFolderAsync(list, "a", "b");
    expect(calls.folderMoves).toEqual([
      { src: "/sites/dev/Docs/a", dest: "/sites/dev/Docs/b" },
    ]);
  });

  it("propagates a move failure", async () => {
    const { sp2 } = fakeSp({ moveError: { status: 400, message: "boom" } });
    const provider = new SharePointProvider(sp2 as never);
    await expect(
      provider.renameFolderAsync(list, "a", "b"),
    ).rejects.toMatchObject({ message: "boom" });
  });
});
