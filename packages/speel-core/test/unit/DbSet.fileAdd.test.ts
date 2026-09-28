import { describe, it, expect } from "vitest";
import { DbSet } from "../../src/DbSet.js";
import { Model } from "../../src/Metadata/Model.js";
import { EntityType } from "../../src/Metadata/EntityType.js";
import { Property } from "../../src/Metadata/Property.js";
import { ChangeTracker } from "../../src/ChangeTracker/ChangeTracker.js";
import { InvalidOperationException } from "../../src/errors.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";

class Doc {
  Id?: number;
  Title?: string;
}

function makeSet() {
  const id = new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });
  const title = new Property({
    propertyName: "Title",
    columnName: "Title",
    displayName: "Title",
    config: { kind: "Text", multiline: false },
    required: false,
    readOnly: false,
    key: false,
  });
  const et = new EntityType<Doc>({
    ctor: Doc,
    list: { kind: "title", value: "Docs" },
    properties: [id, title],
  });
  const model = new Model([et]);
  const tracker = new ChangeTracker(model);
  const set = new DbSet<Doc>(Doc, model, new FakeStorageProvider(), tracker);
  return { set };
}

function makeSetWithTracker() {
  const id = new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });
  const title = new Property({
    propertyName: "Title",
    columnName: "Title",
    displayName: "Title",
    config: { kind: "Text", multiline: false },
    required: false,
    readOnly: false,
    key: false,
  });
  const et = new EntityType<Doc>({
    ctor: Doc,
    list: { kind: "title", value: "Docs" },
    properties: [id, title],
  });
  const model = new Model([et]);
  const tracker = new ChangeTracker(model);
  const set = new DbSet<Doc>(Doc, model, new FakeStorageProvider(), tracker);
  return { set, tracker };
}

describe("DbSet.add file option", () => {
  it("re-adding a tracked Added instance re-stages options instead of double-tracking", () => {
    const { set, tracker } = makeSetWithTracker();
    const d = new Doc();
    const first = set.add(d, {
      folder: "a",
      file: { name: "v1.pdf", content: "one" },
    });
    const second = set.add(d, { file: { name: "v2.pdf", content: "two" } });
    expect(second).toBe(first); // same entry, no duplicate
    expect(tracker.entries()).toHaveLength(1);
    expect(second.targetFile?.fileName).toBe("v2.pdf"); // staged options replaced
    expect(second.targetFolder).toBeUndefined(); // omitted → cleared
  });

  it("an invalid option leaves nothing tracked (validation precedes tracking)", () => {
    const { set, tracker } = makeSetWithTracker();
    expect(() =>
      set.add(new Doc(), {
        folder: "a/../b",
        file: { name: "x.txt", content: "x" },
      }),
    ).toThrow(InvalidOperationException);
    expect(() => set.add(new Doc(), { file: { content: "no-name" } })).toThrow(
      InvalidOperationException,
    );
    expect(tracker.entries()).toHaveLength(0);
  });

  it("stages a resolved targetFile when { file } is passed", () => {
    const { set } = makeSet();
    const entry = set.add(new Doc(), {
      file: { name: "q2.pdf", content: "data" },
    });
    expect(entry.targetFile).toEqual({
      fileName: "q2.pdf",
      content: "data",
      overwrite: false,
      onProgress: undefined,
      signal: undefined,
    });
  });

  it("composes folder and file: both staged", () => {
    const { set } = makeSet();
    const entry = set.add(new Doc(), {
      folder: "/reports//2026/",
      file: { name: "q2.pdf", content: "data" },
    });
    expect(entry.targetFolder).toBe("reports/2026");
    expect(entry.targetFile?.fileName).toBe("q2.pdf");
  });

  it("leaves targetFile undefined for a plain add", () => {
    const { set } = makeSet();
    expect(set.add(new Doc()).targetFile).toBeUndefined();
  });

  it("throws synchronously on an unresolvable file name", () => {
    const { set } = makeSet();
    expect(() => set.add(new Doc(), { file: { content: "x" } })).toThrow(
      InvalidOperationException,
    );
  });
});
