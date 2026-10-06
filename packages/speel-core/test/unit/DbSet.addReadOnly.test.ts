import { it, expect, vi, afterEach } from "vitest";
import {
  DbContext,
  initSpeelDbContext,
  Entity,
  Key,
  TextField,
  SpeelEntity,
  SpeelDocument,
} from "../../src/index.js";
import type { IBatchOperation } from "../../src/providers/ISharePointProvider.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";

@Entity({ list: "Notes" })
class Note extends SpeelEntity {
  @Key override Id?: number = undefined;
  @TextField() Title: string | null = null;
}
@Entity({ list: "Papers" })
class Paper extends SpeelDocument {
  @TextField() Title: string | null = null;
}
class Ctx extends DbContext {
  notes = this.set(Note);
  papers = this.set(Paper);
}

afterEach(() => {
  vi.restoreAllMocks();
});

it("a duplicated SpeelEntity inserts without its system fields and clears them after save", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const provider = new FakeStorageProvider();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const original = Object.assign(new Note(), { Title: "A" });
  ctx.notes.add(original);
  await ctx.saveChangesAsync();
  expect(warn).not.toHaveBeenCalled();

  const copy = ctx.notes.clone(original);
  // What a loaded row carries for display:
  Object.assign(copy, { Created: new Date(2020, 0, 1), AuthorId: 7 });
  delete copy.Id;
  ctx.notes.add(copy);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(String(warn.mock.calls[0]![0])).toMatch(/Created.*AuthorId/);

  const ops: IBatchOperation[] = [];
  const orig = provider.executeBatchAsync.bind(provider);
  provider.executeBatchAsync = async (batch) => {
    ops.push(...batch);
    return orig(batch);
  };
  await ctx.saveChangesAsync();

  const insert = ops.find((o) => o.kind === "insert")!;
  if (insert.kind !== "insert") throw new Error("expected insert");
  expect(insert.fields.map((f) => f.property.propertyName)).toEqual(["Title"]);
  expect(copy.Id).toBe(2);
  expect(copy.Created).toBeUndefined();
  expect(copy.AuthorId).toBeUndefined();
  expect(copy.Author).toBeUndefined();
  expect(copy.Title).toBe("A");
  expect(ctx.entry(copy).getDirtyColumns()).toEqual([]);
});

it("a file add clears carried read-only values but keeps the server's file facts", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const provider = new FakeStorageProvider();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const paper = Object.assign(new Paper(), {
    Title: "P",
    Created: new Date(2020, 0, 1),
    FileLeafRef: "old.txt",
  });
  ctx.papers.add(paper, { file: { name: "new.txt", content: "x" } });
  await ctx.saveChangesAsync();
  expect(paper.Id).toBeGreaterThan(0);
  expect(paper.Created).toBeUndefined();
  expect(paper.FileLeafRef).toBe("new.txt");
  expect(paper.FileRef).toMatch(/new\.txt$/);
});
