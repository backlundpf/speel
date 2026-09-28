// test/unit/ChangeTracker/EntityEntry.test.ts
import { describe, it, expect } from "vitest";
import {
  EntityEntry,
  EntityState,
} from "../../../src/ChangeTracker/EntityEntry.js";
import { Snapshot } from "../../../src/ChangeTracker/Snapshot.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";

class Blog {
  Id?: number;
  Title?: string;
}

function et() {
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
    config: { kind: "Text", maxLength: 255 },
    required: false,
    readOnly: false,
    key: false,
  });
  return new EntityType({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [id, title],
  });
}

describe("EntityEntry", () => {
  it("exposes entity, state, entityType", () => {
    const e = new Blog();
    e.Id = 1;
    const snap = Snapshot.take(e, et());
    const entry = new EntityEntry(e, et(), EntityState.Unchanged, snap);
    expect(entry.entity).toBe(e);
    expect(entry.state).toBe(EntityState.Unchanged);
    expect(entry.entityType).toEqual(et());
  });

  it("isKeySet false until Id is set", () => {
    const e = new Blog();
    const entry = new EntityEntry(e, et(), EntityState.Added, undefined);
    expect(entry.isKeySet).toBe(false);
    e.Id = 5;
    expect(entry.isKeySet).toBe(true);
  });

  it("getDirtyColumns returns column names when state is Modified", () => {
    const e = new Blog();
    e.Id = 1;
    e.Title = "A";
    const snap = Snapshot.take(e, et());
    const entry = new EntityEntry(e, et(), EntityState.Unchanged, snap);
    e.Title = "B";
    expect(entry.getDirtyColumns()).toEqual(["Title"]);
  });

  it("refreshSnapshot replaces the snapshot from current values", () => {
    const e = new Blog();
    e.Id = 1;
    e.Title = "A";
    const snap = Snapshot.take(e, et());
    const entry = new EntityEntry(e, et(), EntityState.Unchanged, snap);
    e.Title = "B";
    entry.refreshSnapshot();
    expect(entry.getDirtyColumns()).toEqual([]);
  });

  it("originalValues exposes the snapshot, currentValues reads through entity", () => {
    const e = new Blog();
    e.Id = 1;
    e.Title = "A";
    const snap = Snapshot.take(e, et());
    const entry = new EntityEntry(e, et(), EntityState.Unchanged, snap);
    e.Title = "B";
    expect(entry.originalValues).toEqual({ Id: 1, Title: "A" });
    expect(entry.currentValues).toEqual({ Id: 1, Title: "B" });
  });

  it("reload throws when no reloadFn was wired up", async () => {
    const e = new Blog();
    e.Id = 1;
    const entry = new EntityEntry(e, et(), EntityState.Unchanged, undefined);
    await expect(entry.reload()).rejects.toThrow("Reload() requires");
  });

  it("reload re-fetches and refreshes via the wired callback", async () => {
    const e = new Blog();
    e.Id = 1;
    e.Title = "A";
    let calls = 0;
    const reloadFn = async () => {
      calls++;
      e.Title = "Server-Updated";
    };
    const entry = new EntityEntry(
      e,
      et(),
      EntityState.Modified,
      undefined,
      reloadFn,
    );
    await entry.reload();
    expect(calls).toBe(1);
    expect(e.Title).toBe("Server-Updated");
  });
});
