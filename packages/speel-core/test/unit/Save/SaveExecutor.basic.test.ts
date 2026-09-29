// test/unit/Save/SaveExecutor.basic.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { SaveExecutor } from "../../../src/Save/SaveExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { Snapshot } from "../../../src/ChangeTracker/Snapshot.js";
import { Model } from "../../../src/Metadata/Model.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IBatchOperation } from "../../../src/providers/ISharePointProvider.js";

class Blog {
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
    config: { kind: "Text", multiline: false, maxLength: 255 },
    required: false,
    readOnly: false,
    key: false,
  });
  const et = new EntityType<Blog>({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [id, title],
  });
  const model = new Model([et]);
  const provider = new FakeStorageProvider();
  const tracker = new ChangeTracker(model);
  return { model, provider, tracker, et };
}

describe("SaveExecutor (basic / single-chunk)", () => {
  let model: Model,
    provider: FakeStorageProvider,
    tracker: ChangeTracker,
    et: EntityType<Blog>;
  beforeEach(() => {
    ({ model, provider, tracker, et } = setup());
  });

  it("returns 0 when there are no pending changes", async () => {
    const exe = new SaveExecutor(model, provider, tracker);
    expect(await exe.saveChangesAsync()).toBe(0);
  });

  it("writes Added entities and populates Id", async () => {
    const b = new Blog();
    b.Title = "New";
    tracker.track(b, EntityState.Added);
    const exe = new SaveExecutor(model, provider, tracker);
    const n = await exe.saveChangesAsync();
    expect(n).toBe(1);
    expect(b.Id).toBe(1);
    expect(tracker.entries(Blog)[0]!.state).toBe(EntityState.Unchanged);
  });

  it("an Added entity is one typed insert at the list root: the model's properties and typed values", async () => {
    const ops: IBatchOperation[] = [];
    const origExec = provider.executeBatchAsync.bind(provider);
    provider.executeBatchAsync = async (batch) => {
      ops.push(...batch);
      return origExec(batch);
    };
    const b = new Blog();
    b.Title = "New";
    tracker.track(b, EntityState.Added);
    await new SaveExecutor(model, provider, tracker).saveChangesAsync();

    expect(ops).toHaveLength(1);
    const op = ops[0]!;
    if (op.kind !== "insert")
      throw new Error(`expected insert, got ${op.kind}`);
    expect(op.folderServerRelativeUrl).toBeNull();
    expect(op.fields).toEqual([
      { property: et.findProperty("Title"), value: "New" },
    ]);
    expect(op.fields[0]!.property).toBe(et.findProperty("Title"));
  });

  it("a Modified entity is one typed update carrying only its dirty fields", async () => {
    provider.seedRow(et.list, { Title: "A" });
    const ops: IBatchOperation[] = [];
    const origExec = provider.executeBatchAsync.bind(provider);
    provider.executeBatchAsync = async (batch) => {
      ops.push(...batch);
      return origExec(batch);
    };
    const b = new Blog();
    b.Id = 1;
    b.Title = "A";
    const entry = tracker.track(b, EntityState.Unchanged, Snapshot.take(b, et));
    b.Title = "B";
    entry.state = EntityState.Modified;
    await new SaveExecutor(model, provider, tracker).saveChangesAsync();

    expect(ops).toHaveLength(1);
    const op = ops[0]!;
    if (op.kind !== "update")
      throw new Error(`expected update, got ${op.kind}`);
    expect(op.id).toBe(1);
    expect(op.fields).toEqual([
      { property: et.findProperty("Title"), value: "B" },
    ]);
    expect(op.fields![0]!.property).toBe(et.findProperty("Title"));
  });

  it("writes Modified entities and resets to Unchanged with refreshed snapshot", async () => {
    // seed
    provider.seedRow(et.list, { Title: "A" });
    const b = new Blog();
    b.Id = 1;
    b.Title = "A";
    const snap = Snapshot.take(b, et);
    const entry = tracker.track(b, EntityState.Unchanged, snap);
    b.Title = "B";
    entry.state = EntityState.Modified;
    const exe = new SaveExecutor(model, provider, tracker);
    expect(await exe.saveChangesAsync()).toBe(1);
    expect(entry.state).toBe(EntityState.Unchanged);
    const fromServer = await provider.getItemByIdAsync(et.list, 1, ["Title"]);
    expect(fromServer!.Title).toBe("B");
    // snapshot now matches the saved state
    b.Title = "B"; // no further change
    expect(entry.getDirtyColumns()).toEqual([]);
  });

  it("writes Deleted entities and untracks them", async () => {
    provider.seedRow(et.list, { Title: "A" });
    const b = new Blog();
    b.Id = 1;
    b.Title = "A";
    const snap = Snapshot.take(b, et);
    const entry = tracker.track(b, EntityState.Unchanged, snap);
    entry.state = EntityState.Deleted;
    const exe = new SaveExecutor(model, provider, tracker);
    expect(await exe.saveChangesAsync()).toBe(1);
    expect(tracker.entries().length).toBe(0);
    expect(await provider.getItemByIdAsync(et.list, 1, ["Title"])).toBeNull();
  });

  it("processes Deleted before Added within a chunk (ordering)", async () => {
    // seed an item to delete
    provider.seedRow(et.list, { Title: "X" });
    const existing = new Blog();
    existing.Id = 1;
    existing.Title = "X";
    const snap = Snapshot.take(existing, et);
    const e1 = tracker.track(existing, EntityState.Unchanged, snap);
    e1.state = EntityState.Deleted;
    const fresh = new Blog();
    fresh.Title = "Y";
    tracker.track(fresh, EntityState.Added);

    const exe = new SaveExecutor(model, provider, tracker);
    expect(await exe.saveChangesAsync()).toBe(2);
    // After save: only the new one remains tracked as Unchanged
    expect(tracker.entries().length).toBe(1);
    expect(fresh.Id).toBeGreaterThan(0);
  });
});
