import { describe, it, expect, vi } from "vitest";
import { DbContext } from "../../../src/DbContext.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { initSpeelDbContext } from "../../../src/initSpeelDbContext.js";
import { InMemoryCacheProvider } from "../../../src/Cache/InMemoryCacheProvider.js";
import { InvalidOperationException } from "../../../src/errors.js";
import { SpeelDocument } from "../../../src/SpeelDocument.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import {
  hasChangeFeed,
  hasFileSystem,
} from "../../../src/providers/capabilities.js";
import type { IStorageProvider } from "../../../src/providers/ISharePointProvider.js";

class Doc extends SpeelDocument {
  Title?: string;
}
class Ctx extends DbContext {
  docs = this.set(Doc);
  protected onModelCreating(mb: ModelBuilder): void {
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.property((d) => d.Title).isText();
      b.useCaching();
    });
  }
}

const FILE_SYSTEM = [
  "ensureFoldersAsync",
  "renameFolderAsync",
  "deleteFolderAsync",
  "uploadFileAsync",
  "renameFileAsync",
  "copyFileAsync",
  "checkinFileAsync",
] as const;

/** The fake with a capability's members hidden: a store that genuinely lacks it. */
function without(
  members: readonly string[],
  fake = new FakeStorageProvider(),
): IStorageProvider {
  return new Proxy(fake, {
    get(t, k, r) {
      if (typeof k === "string" && members.includes(k)) return undefined;
      const v = Reflect.get(t, k, r);
      return typeof v === "function" ? v.bind(t) : v;
    },
    has(t, k) {
      return typeof k === "string" && members.includes(k) ? false : k in t;
    },
  }) as unknown as IStorageProvider;
}

describe("provider capabilities", () => {
  it("the fake and the guards agree: it has both", () => {
    const fake = new FakeStorageProvider();
    expect(hasFileSystem(fake)).toBe(true);
    expect(hasChangeFeed(fake)).toBe(true);
    expect(hasFileSystem(without(FILE_SYSTEM))).toBe(false);
    // Structural means EVERY member: one missing is a store without the capability.
    expect(hasFileSystem(without(["uploadFileAsync"]))).toBe(false);
    expect(hasChangeFeed(without(["getListItemChangesSinceToken"]))).toBe(
      false,
    );
  });

  it("without a file system: folder and file operations throw naming the capability; reads and root writes work", async () => {
    const p = without(FILE_SYSTEM);
    const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(p));
    const doc = Object.assign(new Doc(), { Title: "root" });
    ctx.docs.add(doc);
    expect(await ctx.saveChangesAsync()).toBe(1); // a root insert needs no file system
    expect((await ctx.docs.toArrayAsync()).map((d) => d.Title)).toEqual([
      "root",
    ]);

    const foldered = Object.assign(new Doc(), { Title: "in a folder" });
    expect(() => ctx.docs.add(foldered, { folder: "A" })).toThrow(
      InvalidOperationException,
    );
    expect(() => ctx.docs.add(foldered, { folder: "A" })).toThrow(
      /IFileSystem/,
    );
    expect(() =>
      ctx.docs.add(foldered, { file: { name: "a.txt", content: "x" } }),
    ).toThrow(/IFileSystem/);
    await expect(ctx.docs.ensureFolderAsync("A")).rejects.toThrow(
      /ensureFolderAsync.*IFileSystem/,
    );
    await expect(ctx.docs.checkinFileAsync(doc, "c")).rejects.toThrow(
      /IFileSystem/,
    );
    await expect(ctx.docs.renameFileAsync(doc, "b.txt")).rejects.toThrow(
      /IFileSystem/,
    );
    await expect(ctx.docs.deleteFolderAsync("A")).rejects.toThrow(
      /IFileSystem/,
    );
    await expect(ctx.docs.renameFolderAsync("A", "B")).rejects.toThrow(
      /renameFolderAsync.*IFileSystem/,
    );
    await expect(
      ctx.docs.copyFileToAsync(doc, ctx.docs, "A", "copy.txt"),
    ).rejects.toThrow(/copyFileToAsync.*IFileSystem/);
  });

  it("without a file system: updates and deletes work", async () => {
    const ctx = initSpeelDbContext(Ctx, (b) =>
      b.useProvider(without(FILE_SYSTEM)),
    );
    const doc = Object.assign(new Doc(), { Title: "v1" });
    ctx.docs.add(doc);
    await ctx.saveChangesAsync();

    doc.Title = "v2";
    expect(await ctx.saveChangesAsync()).toBe(1);
    expect((await ctx.docs.toArrayAsync()).map((d) => d.Title)).toEqual(["v2"]);

    ctx.docs.remove(doc);
    expect(await ctx.saveChangesAsync()).toBe(1);
    expect(await ctx.docs.toArrayAsync()).toEqual([]);
  });

  it("without a file system: a file add that reaches the executor is refused before any batch is sent", async () => {
    const fake = new FakeStorageProvider();
    const batches = vi.spyOn(fake, "executeBatchAsync");
    const ctx = initSpeelDbContext(Ctx, (b) =>
      b.useProvider(without(FILE_SYSTEM, fake)),
    );
    ctx.docs.add(Object.assign(new Doc(), { Title: "root" }));
    // Staged behind add()'s guard: the executor's own defence must fire before
    // the root insert above commits, not after.
    const entry = ctx.docs.add(Object.assign(new Doc(), { Title: "file" }));
    entry.targetFile = {
      fileName: "a.txt",
      content: new Blob(["x"]),
      overwrite: false,
    };
    await expect(ctx.saveChangesAsync()).rejects.toThrow(
      /add\(\{ file \}\).*IFileSystem/,
    );
    expect(batches).not.toHaveBeenCalled();
  });

  it("without a change feed: cacheAsync throws naming the capability; a live read works", async () => {
    const p = without(["getListItemChangesSinceToken"]);
    const ctx = initSpeelDbContext(Ctx, (b) =>
      b.useProvider(p).useCaching(new InMemoryCacheProvider()),
    );
    expect(await ctx.docs.toArrayAsync()).toEqual([]);
    await expect(ctx.docs.cacheAsync()).rejects.toThrow(
      InvalidOperationException,
    );
    await expect(ctx.docs.cacheAsync()).rejects.toThrow(/IChangeFeed/);
  });
});
