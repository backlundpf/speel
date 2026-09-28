import { describe, it, expect, vi } from "vitest";
import { SaveExecutor } from "../../../src/Save/SaveExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { Model } from "../../../src/Metadata/Model.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { DbUpdateException } from "../../../src/errors.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IStagedFile } from "../../../src/Save/fileUpload.js";

class Doc {
  Id?: number;
  Title?: string;
  FileName?: string;
  FileUrl?: string;
}

function setup() {
  const props = [
    new Property({
      propertyName: "Id",
      columnName: "ID",
      displayName: "ID",
      config: { kind: "Number" },
      required: true,
      readOnly: true,
      key: true,
    }),
    new Property({
      propertyName: "Title",
      columnName: "Title",
      displayName: "Title",
      config: { kind: "Text", multiline: false },
      required: false,
      readOnly: false,
      key: false,
    }),
    // Server-populated file facts, mapped per spec §4 (read-only, like Id).
    new Property({
      propertyName: "FileName",
      columnName: "FileLeafRef",
      displayName: "Name",
      config: { kind: "Text", multiline: false },
      required: false,
      readOnly: true,
      key: false,
    }),
    new Property({
      propertyName: "FileUrl",
      columnName: "FileRef",
      displayName: "URL",
      config: { kind: "Text", multiline: false },
      required: false,
      readOnly: true,
      key: false,
    }),
  ];
  const et = new EntityType<Doc>({
    ctor: Doc,
    list: { kind: "title", value: "Docs" },
    properties: props,
  });
  const model = new Model([et]);
  const provider = new FakeStorageProvider();
  const tracker = new ChangeTracker(model);
  return {
    model,
    provider,
    tracker,
    list: { kind: "title" as const, value: "Docs" },
  };
}

function staged(over?: Partial<IStagedFile>): IStagedFile {
  return { fileName: "q2.pdf", content: "data!", overwrite: false, ...over };
}

describe("SaveExecutor file-content adds", () => {
  it("routes a file add through uploadFileAsync (not the batch), reconciling id + file facts", async () => {
    const s = setup();
    const batchKinds: string[] = [];
    const origExec = s.provider.executeBatchAsync.bind(s.provider);
    s.provider.executeBatchAsync = async (ops) => {
      for (const o of ops) batchKinds.push(o.kind);
      return origExec(ops);
    };

    const d = new Doc();
    d.Title = "Report";
    const entry = s.tracker.track(d, EntityState.Added);
    entry.targetFile = staged();

    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    expect(await exe.saveChangesAsync()).toBe(1);

    expect(batchKinds).toEqual([]); // nothing rode the batch
    expect(s.provider.getFiles(s.list)).toEqual(["/sites/dev/Docs/q2.pdf"]); // root upload
    expect(d.Id).toBeGreaterThan(0);
    expect(d.FileName).toBe("q2.pdf"); // FileLeafRef reflected
    expect(d.FileUrl).toBe("/sites/dev/Docs/q2.pdf"); // FileRef reflected
    expect(entry.state).toBe(EntityState.Unchanged);
    expect(entry.getDirtyColumns()).toEqual([]); // snapshot covers reflections
    const item = await s.provider.getItemByIdAsync(s.list, d.Id!, ["Title"]);
    expect(item).toMatchObject({ Title: "Report" }); // metadata applied
  });

  it("composes folder + file: ensures the folder and uploads into its resolved URL", async () => {
    const s = setup();
    const d = new Doc();
    d.Title = "Nested";
    const entry = s.tracker.track(d, EntityState.Added);
    entry.targetFolder = "reports/2026";
    entry.targetFile = staged();

    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    expect(await exe.saveChangesAsync()).toBe(1);

    expect(s.provider.getFolders(s.list).sort()).toEqual([
      "reports",
      "reports/2026",
    ]);
    expect(s.provider.getFiles(s.list)).toEqual([
      "/sites/dev/Docs/reports/2026/q2.pdf",
    ]);
    expect(d.FileUrl).toBe("/sites/dev/Docs/reports/2026/q2.pdf");
  });

  it("routes a plain add through the batch and a file add through uploadFileAsync in one save", async () => {
    const s = setup();
    const batchKinds: string[] = [];
    const origExec = s.provider.executeBatchAsync.bind(s.provider);
    s.provider.executeBatchAsync = async (ops) => {
      for (const o of ops) batchKinds.push(o.kind);
      return origExec(ops);
    };

    const plain = new Doc();
    plain.Title = "plain";
    s.tracker.track(plain, EntityState.Added);
    const filed = new Doc();
    filed.Title = "filed";
    s.tracker.track(filed, EntityState.Added).targetFile = staged();

    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    expect(await exe.saveChangesAsync()).toBe(2);
    expect(batchKinds).toEqual(["insert"]);
    expect(plain.Id).toBeGreaterThan(0);
    expect(filed.Id).toBeGreaterThan(0);
    expect(filed.FileName).toBe("q2.pdf");
    expect(plain.FileName).toBeUndefined(); // no reflection on plain adds
  });

  it("forwards onProgress from the staged file", async () => {
    const s = setup();
    const onProgress = vi.fn();
    const d = new Doc();
    s.tracker.track(d, EntityState.Added).targetFile = staged({ onProgress });
    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    await exe.saveChangesAsync();
    expect(onProgress).toHaveBeenCalledWith({
      bytesUploaded: 5,
      bytesTotal: 5,
    });
  });

  it("folds an upload failure into DbUpdateException with the failed entry", async () => {
    const s = setup();
    // Pre-existing file at the same path; overwrite=false → uploadFileAsync throws.
    await s.provider.uploadFileAsync(s.list, null, {
      fileName: "q2.pdf",
      content: "old",
      overwrite: false,
      fields: [],
    });
    const d = new Doc();
    const entry = s.tracker.track(d, EntityState.Added);
    entry.targetFile = staged();

    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    await expect(exe.saveChangesAsync()).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(DbUpdateException);
      expect((err as DbUpdateException).entries).toContain(entry);
      return true;
    });
    expect(entry.state).toBe(EntityState.Added); // not promoted
  });
});
