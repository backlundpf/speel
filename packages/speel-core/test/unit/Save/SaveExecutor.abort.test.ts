import { describe, it, expect } from "vitest";
import { SaveExecutor } from "../../../src/Save/SaveExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { Model } from "../../../src/Metadata/Model.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { SaveAbortedException } from "../../../src/errors.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IStagedFile } from "../../../src/Save/fileUpload.js";

class Doc {
  Id?: number;
  Title?: string;
}

function setup() {
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

describe("SaveExecutor abort", () => {
  it("a pre-aborted signal rejects and saves nothing", async () => {
    const s = setup();
    const d = new Doc();
    d.Title = "x";
    const entry = s.tracker.track(d, EntityState.Added);
    const ac = new AbortController();
    ac.abort();
    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    await expect(
      exe.saveChangesAsync({ signal: ac.signal }),
    ).rejects.toBeInstanceOf(SaveAbortedException);
    expect(entry.state).toBe(EntityState.Added);
    expect(d.Id).toBeUndefined();
  });

  it("abort during chunk 1 reconciles it and never sends chunk 2", async () => {
    const s = setup();
    const ac = new AbortController();
    let calls = 0;
    const orig = s.provider.executeBatchAsync.bind(s.provider);
    s.provider.executeBatchAsync = async (ops) => {
      calls++;
      ac.abort();
      return orig(ops);
    };
    const a = new Doc();
    a.Title = "a";
    const b = new Doc();
    b.Title = "b";
    s.tracker.track(a, EntityState.Added);
    s.tracker.track(b, EntityState.Added);
    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    await expect(
      exe.saveChangesAsync({ signal: ac.signal, maxBatchSize: 1 }),
    ).rejects.toBeInstanceOf(SaveAbortedException);
    expect(calls).toBe(1); // chunk 2 never sent
    expect(a.Id).toBeGreaterThan(0); // chunk 1 reconciled (no rollback)
    expect(b.Id).toBeUndefined();
  });

  it("abort after the batch skips the file uploads", async () => {
    const s = setup();
    const ac = new AbortController();
    const orig = s.provider.executeBatchAsync.bind(s.provider);
    s.provider.executeBatchAsync = async (ops) => {
      ac.abort();
      return orig(ops);
    };
    const plain = new Doc();
    plain.Title = "plain";
    s.tracker.track(plain, EntityState.Added);
    const filed = new Doc();
    filed.Title = "filed";
    s.tracker.track(filed, EntityState.Added).targetFile = staged();
    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    await expect(
      exe.saveChangesAsync({ signal: ac.signal }),
    ).rejects.toBeInstanceOf(SaveAbortedException);
    expect(plain.Id).toBeGreaterThan(0); // batch landed + reconciled
    expect(s.provider.getFiles(s.list)).toEqual([]); // upload never started
    expect(filed.Id).toBeUndefined();
  });

  it("forwards the save signal to uploads only when the staged file has none", async () => {
    const s = setup();
    const seen: (AbortSignal | undefined)[] = [];
    const orig = s.provider.uploadFileAsync.bind(s.provider);
    s.provider.uploadFileAsync = async (list, url, request) => {
      seen.push(request.signal);
      return orig(list, url, request);
    };

    const ac = new AbortController();
    const own = new AbortController();
    const d1 = new Doc();
    d1.Title = "one";
    s.tracker.track(d1, EntityState.Added).targetFile = staged();
    const d2 = new Doc();
    d2.Title = "two";
    s.tracker.track(d2, EntityState.Added).targetFile = staged({
      fileName: "other.pdf",
      signal: own.signal,
    });

    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    await exe.saveChangesAsync({ signal: ac.signal });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(ac.signal); // none staged → save signal forwarded
    expect(seen[1]).toBe(own.signal); // staged signal wins
  });

  it("an AbortError from uploadFileAsync surfaces as SaveAbortedException", async () => {
    const s = setup();
    s.provider.uploadFileAsync = async () => {
      const e = new Error("File upload aborted.");
      e.name = "AbortError";
      throw e;
    };
    const d = new Doc();
    d.Title = "x";
    const entry = s.tracker.track(d, EntityState.Added);
    entry.targetFile = staged();
    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    await expect(exe.saveChangesAsync()).rejects.toBeInstanceOf(
      SaveAbortedException,
    );
    expect(entry.state).toBe(EntityState.Added);
  });
});
