import { describe, it, expect, vi } from "vitest";
import { FakeStorageProvider } from "./FakeStorageProvider.js";
import { textProperty } from "../../../src/testing/properties.js";

const list = { kind: "title" as const, value: "Docs" };

describe("FakeStorageProvider file support", () => {
  it("uploads into a folder URL, stores an item with file facts + typed fields, fires progress once", async () => {
    const p = new FakeStorageProvider();
    const onProgress = vi.fn();
    const res = await p.uploadFileAsync(list, "/sites/dev/Docs/a", {
      fileName: "q2.pdf",
      content: "data!",
      overwrite: false,
      fields: [{ property: textProperty("Title"), value: "Hi" }],
      onProgress,
    });
    expect(res.id).toBeGreaterThan(0);
    expect(res.fileName).toBe("q2.pdf");
    expect(res.serverRelativeUrl).toBe("/sites/dev/Docs/a/q2.pdf");
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      bytesUploaded: 5,
      bytesTotal: 5,
    });
    expect(p.getFiles(list)).toEqual(["/sites/dev/Docs/a/q2.pdf"]);
    const item = await p.getItemByIdAsync(list, res.id, [
      "Title",
      "FileLeafRef",
      "FileRef",
      "__folder",
    ]);
    expect(item).toMatchObject({
      Title: "Hi",
      FileLeafRef: "q2.pdf",
      FileRef: "/sites/dev/Docs/a/q2.pdf",
      __folder: "/sites/dev/Docs/a",
    });
  });

  it("defaults to the library root when folderServerRelativeUrl is null", async () => {
    const p = new FakeStorageProvider();
    const res = await p.uploadFileAsync(list, null, {
      fileName: "a.txt",
      content: "x",
      overwrite: false,
      fields: [],
    });
    expect(res.serverRelativeUrl).toBe("/sites/dev/Docs/a.txt");
  });

  it("throws on an existing path without overwrite; overwrite replaces and keeps the id", async () => {
    const p = new FakeStorageProvider();
    const first = await p.uploadFileAsync(list, null, {
      fileName: "a.txt",
      content: "v1",
      overwrite: false,
      fields: [],
    });
    await expect(
      p.uploadFileAsync(list, null, {
        fileName: "a.txt",
        content: "v2",
        overwrite: false,
        fields: [],
      }),
    ).rejects.toThrow(/already exists/);
    const second = await p.uploadFileAsync(list, null, {
      fileName: "a.txt",
      content: "v2",
      overwrite: true,
      fields: [],
    });
    expect(second.id).toBe(first.id);
    expect(p.getFiles(list)).toEqual(["/sites/dev/Docs/a.txt"]);
  });

  it("renameFileAsync moves the file within its folder and rewrites the item's file facts", async () => {
    const p = new FakeStorageProvider();
    const up = await p.uploadFileAsync(list, "/sites/dev/Docs/a", {
      fileName: "q2.pdf",
      content: "data",
      overwrite: false,
      fields: [],
    });
    const res = await p.renameFileAsync(list, up.id, "q2-final.pdf");
    expect(res).toEqual({
      name: "q2-final.pdf",
      serverRelativeUrl: "/sites/dev/Docs/a/q2-final.pdf",
    });
    expect(p.getFiles(list)).toEqual(["/sites/dev/Docs/a/q2-final.pdf"]);
    const item = await p.getItemByIdAsync(list, up.id, [
      "FileLeafRef",
      "FileRef",
      "__folder",
    ]);
    expect(item).toMatchObject({
      FileLeafRef: "q2-final.pdf",
      FileRef: "/sites/dev/Docs/a/q2-final.pdf",
      __folder: "/sites/dev/Docs/a", // stays in place
    });
  });

  it("renameFileAsync refuses a name already taken in the same folder", async () => {
    const p = new FakeStorageProvider();
    const a = await p.uploadFileAsync(list, null, {
      fileName: "a.txt",
      content: "x",
      overwrite: false,
      fields: [],
    });
    await p.uploadFileAsync(list, null, {
      fileName: "b.txt",
      content: "y",
      overwrite: false,
      fields: [],
    });
    await expect(p.renameFileAsync(list, a.id, "b.txt")).rejects.toThrow(
      /already exists/,
    );
    expect(p.getFiles(list).sort()).toEqual([
      "/sites/dev/Docs/a.txt",
      "/sites/dev/Docs/b.txt",
    ]);
  });

  it("renameFileAsync throws for an unknown item", async () => {
    const p = new FakeStorageProvider();
    await expect(p.renameFileAsync(list, 999, "x.txt")).rejects.toThrow(/999/);
  });

  it("checkinFileAsync clears the checkout and records the comment", async () => {
    const p = new FakeStorageProvider();
    const up = await p.uploadFileAsync(list, "/sites/dev/Docs/a", {
      fileName: "q2.pdf",
      content: "x",
      overwrite: false,
      fields: [],
    });
    p.checkOutFile(list, up.id, 7);
    expect(
      await p.getItemByIdAsync(list, up.id, ["CheckoutUserId"]),
    ).toMatchObject({ CheckoutUserId: 7 });

    await p.checkinFileAsync(list, up.id, "done");

    expect(
      await p.getItemByIdAsync(list, up.id, ["CheckoutUserId"]),
    ).toMatchObject({ CheckoutUserId: null });
    expect(p.checkins(list)).toEqual([{ id: up.id, comment: "done" }]);
  });

  it("checkinFileAsync rejects a file that is not checked out, and an unknown item", async () => {
    const p = new FakeStorageProvider();
    const up = await p.uploadFileAsync(list, "/sites/dev/Docs/a", {
      fileName: "q2.pdf",
      content: "x",
      overwrite: false,
      fields: [],
    });
    await expect(p.checkinFileAsync(list, up.id, "")).rejects.toThrow(
      /not checked out/,
    );
    await expect(p.checkinFileAsync(list, 999, "")).rejects.toThrow(/999/);
    expect(p.checkins(list)).toEqual([]);
  });

  it("rejects with AbortError when the signal is already aborted", async () => {
    const p = new FakeStorageProvider();
    const ac = new AbortController();
    ac.abort();
    await expect(
      p.uploadFileAsync(list, null, {
        fileName: "a.txt",
        content: "x",
        overwrite: false,
        fields: [],
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(p.getFiles(list)).toEqual([]);
  });
});
