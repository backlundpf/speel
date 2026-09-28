import { describe, it, expect } from "vitest";
import { FakeStorageProvider } from "./FakeStorageProvider.js";
import { textProperty } from "../../../src/testing/properties.js";

const list = { kind: "title" as const, value: "Docs" };
const TITLE = textProperty("Title");

/** Place one item in `folder` through the typed write op; returns its id. */
async function insertInFolder(
  p: FakeStorageProvider,
  folder: string,
  title: string,
): Promise<number> {
  const [res] = await p.executeBatchAsync([
    {
      kind: "insert",
      list,
      fields: [{ property: TITLE, value: title }],
      folderServerRelativeUrl: folder,
      clientToken: "t1",
    },
  ]);
  if (res?.kind !== "success") throw new Error("seed failed");
  return res.serverData!.id;
}

describe("FakeStorageProvider folder support", () => {
  it("ensureFoldersAsync creates ancestor levels, dedups, and resolves URLs", async () => {
    const p = new FakeStorageProvider();
    const map = await p.ensureFoldersAsync(list, ["a/b/c", "a/b"]);
    expect(p.getFolders(list).sort()).toEqual(["a", "a/b", "a/b/c"]);
    expect(map.get("a/b/c")).toMatch(/\/a\/b\/c$/);
    expect(map.get("a/b")).toMatch(/\/a\/b$/);
  });

  it("ensureFoldersAsync is idempotent across calls", async () => {
    const p = new FakeStorageProvider();
    await p.ensureFoldersAsync(list, ["x/y"]);
    await p.ensureFoldersAsync(list, ["x/y"]);
    expect(p.getFolders(list).sort()).toEqual(["x", "x/y"]);
  });

  it("renameFolderAsync re-keys the folder, its descendants, and everything inside them", async () => {
    const p = new FakeStorageProvider();
    await p.ensureFoldersAsync(list, ["responses/r-1/evidence"]);
    const up = await p.uploadFileAsync(list, "/sites/dev/Docs/responses/r-1", {
      fileName: "answer.docx",
      content: "x",
      overwrite: false,
      fields: [],
    });
    const nested = await p.uploadFileAsync(
      list,
      "/sites/dev/Docs/responses/r-1/evidence",
      { fileName: "proof.png", content: "y", overwrite: false, fields: [] },
    );

    const res = await p.renameFolderAsync(list, "responses/r-1", "r-1-final");
    expect(res).toEqual({
      name: "r-1-final",
      serverRelativeUrl: "/sites/dev/Docs/responses/r-1-final",
    });
    expect(p.getFolders(list).sort()).toEqual([
      "responses",
      "responses/r-1-final",
      "responses/r-1-final/evidence",
    ]);
    expect(p.getFiles(list).sort()).toEqual([
      "/sites/dev/Docs/responses/r-1-final/answer.docx",
      "/sites/dev/Docs/responses/r-1-final/evidence/proof.png",
    ]);
    expect(
      await p.getItemByIdAsync(list, up.id, ["FileRef", "__folder"]),
    ).toMatchObject({
      FileRef: "/sites/dev/Docs/responses/r-1-final/answer.docx",
      __folder: "/sites/dev/Docs/responses/r-1-final",
    });
    expect(
      await p.getItemByIdAsync(list, nested.id, ["FileRef", "__folder"]),
    ).toMatchObject({
      FileRef: "/sites/dev/Docs/responses/r-1-final/evidence/proof.png",
      __folder: "/sites/dev/Docs/responses/r-1-final/evidence",
    });
  });

  it("renameFolderAsync renames the folder's own row and moves a child's FileDirRef", async () => {
    const p = new FakeStorageProvider();
    await p.ensureFoldersAsync(list, ["a"]);
    await insertInFolder(p, "/sites/dev/Docs/a", "row");
    await p.renameFolderAsync(list, "a", "b");
    const rows = await p.getItemsPagedAsync(
      list,
      ["Title", "FileLeafRef", "FileRef", "FileDirRef"],
      50,
      undefined,
      { includeContainers: true },
    );
    expect(rows.items).toContainEqual(
      expect.objectContaining({
        FileLeafRef: "b",
        FileRef: "/sites/dev/Docs/b",
      }),
    );
    expect(rows.items).toContainEqual(
      expect.objectContaining({
        Title: "row",
        FileDirRef: "/sites/dev/Docs/b",
      }),
    );
  });

  it("renameFolderAsync refuses an occupied destination and an unknown folder", async () => {
    const p = new FakeStorageProvider();
    await p.ensureFoldersAsync(list, ["a", "b"]);
    await expect(p.renameFolderAsync(list, "a", "b")).rejects.toThrow(
      /already exists/,
    );
    await expect(p.renameFolderAsync(list, "nope", "x")).rejects.toThrow(
      /not found/,
    );
    expect(p.getFolders(list).sort()).toEqual(["a", "b"]);
  });

  it("deleteFolderAsync recycles the folder together with everything inside it", async () => {
    const p = new FakeStorageProvider();
    await p.ensureFoldersAsync(list, ["responses/r-1/evidence", "keep"]);
    const answer = await p.uploadFileAsync(
      list,
      "/sites/dev/Docs/responses/r-1",
      {
        fileName: "answer.docx",
        content: "x",
        overwrite: false,
        fields: [],
      },
    );
    const proof = await p.uploadFileAsync(
      list,
      "/sites/dev/Docs/responses/r-1/evidence",
      { fileName: "proof.png", content: "y", overwrite: false, fields: [] },
    );
    const kept = await p.uploadFileAsync(list, "/sites/dev/Docs/keep", {
      fileName: "safe.txt",
      content: "z",
      overwrite: false,
      fields: [],
    });

    await p.deleteFolderAsync(list, "responses/r-1");

    // The folder and its descendant folders are gone; siblings and ancestors stay.
    expect(p.getFolders(list).sort()).toEqual(["keep", "responses"]);
    // Contents went with it — SP.Folder.Recycle takes the whole subtree.
    expect(p.getFiles(list)).toEqual(["/sites/dev/Docs/keep/safe.txt"]);
    expect(await p.getItemByIdAsync(list, answer.id, ["FileRef"])).toBeNull();
    expect(await p.getItemByIdAsync(list, proof.id, ["FileRef"])).toBeNull();
    expect(await p.getItemByIdAsync(list, kept.id, ["FileRef"])).not.toBeNull();
  });

  it("deleteFolderAsync recycles rather than destroys, and takes folderless items in the folder", async () => {
    const p = new FakeStorageProvider();
    const url = (await p.ensureFoldersAsync(list, ["a"])).get("a")!;
    const itemId = await insertInFolder(p, url, "Hi");

    await p.deleteFolderAsync(list, "a");

    // An item placed in the folder has a folder but no FileRef, and must still go.
    expect(await p.getItemByIdAsync(list, itemId, ["Title"])).toBeNull();
    expect(p.recycledIds(list)).toContain(itemId);
    expect(p.hardDeletedIds(list)).toEqual([]);
  });

  it("deleteFolderAsync rejects an unknown folder and leaves the tree alone", async () => {
    const p = new FakeStorageProvider();
    await p.ensureFoldersAsync(list, ["a"]);
    await expect(p.deleteFolderAsync(list, "nope")).rejects.toThrow(
      /not found/,
    );
    expect(p.getFolders(list)).toEqual(["a"]);
  });
});
