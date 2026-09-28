// test/unit/ChangeTracker/ChangeTracker.test.ts
import { describe, it, expect } from "vitest";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { Snapshot } from "../../../src/ChangeTracker/Snapshot.js";
import { Model } from "../../../src/Metadata/Model.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";

class Blog {
  Id?: number;
  Title?: string;
}
class Tag {
  Id?: number;
  Name?: string;
}

function model() {
  const make = (ctor: new () => unknown, list: string, propName: string) => {
    const id = new Property({
      propertyName: "Id",
      columnName: "ID",
      displayName: "ID",
      config: { kind: "Number" },
      required: true,
      readOnly: true,
      key: true,
    });
    const p = new Property({
      propertyName: propName,
      columnName: propName,
      displayName: propName,
      config: { kind: "Text", maxLength: 255 },
      required: false,
      readOnly: false,
      key: false,
    });
    return new EntityType({
      ctor: ctor as never,
      list: { kind: "title", value: list },
      properties: [id, p],
    });
  };
  return new Model([make(Blog, "Blogs", "Title"), make(Tag, "Tags", "Name")]);
}

describe("ChangeTracker", () => {
  it("tracks an Added entity with no snapshot", () => {
    const ct = new ChangeTracker(model());
    const b = new Blog();
    const entry = ct.track(b, EntityState.Added);
    expect(entry.state).toBe(EntityState.Added);
    expect(ct.entries().length).toBe(1);
  });

  it("identity-map: same (ctor, id) returns the existing entry", () => {
    const ct = new ChangeTracker(model());
    const b = new Blog();
    b.Id = 1;
    const snap = Snapshot.take(b, model().findEntityType(Blog)!);
    const e1 = ct.track(b, EntityState.Unchanged, snap);
    const b2 = new Blog();
    b2.Id = 1;
    const e2 = ct.findEntry(Blog, 1);
    expect(e2).toBe(e1);
    expect(ct.entries().length).toBe(1);
    // findOrTrack: returns existing when the same id is seen
    const e3 = ct.findOrTrack(Blog, b2, EntityState.Unchanged, snap);
    expect(e3).toBe(e1);
  });

  it("entries(ctor) filters to one entity type", () => {
    const ct = new ChangeTracker(model());
    ct.track(new Blog(), EntityState.Added);
    ct.track(new Tag(), EntityState.Added);
    expect(ct.entries(Blog).length).toBe(1);
    expect(ct.entries(Tag).length).toBe(1);
    expect(ct.entries().length).toBe(2);
  });

  it("detectChanges flips Unchanged → Modified when entity mutated", () => {
    const ct = new ChangeTracker(model());
    const b = new Blog();
    b.Id = 1;
    b.Title = "A";
    const snap = Snapshot.take(b, model().findEntityType(Blog)!);
    ct.track(b, EntityState.Unchanged, snap);
    b.Title = "B";
    ct.detectChanges();
    expect(ct.entries(Blog)[0]!.state).toBe(EntityState.Modified);
  });

  it("detectChanges flips Modified → Unchanged when revert restores snapshot values", () => {
    const ct = new ChangeTracker(model());
    const b = new Blog();
    b.Id = 1;
    b.Title = "A";
    const snap = Snapshot.take(b, model().findEntityType(Blog)!);
    ct.track(b, EntityState.Unchanged, snap);
    b.Title = "B";
    ct.detectChanges();
    b.Title = "A";
    ct.detectChanges();
    expect(ct.entries(Blog)[0]!.state).toBe(EntityState.Unchanged);
  });

  it("clear detaches everything", () => {
    const ct = new ChangeTracker(model());
    ct.track(new Blog(), EntityState.Added);
    ct.clear();
    expect(ct.entries().length).toBe(0);
  });

  it("hasChanges true if any entry is Added/Modified/Deleted", () => {
    const ct = new ChangeTracker(model());
    expect(ct.hasChanges()).toBe(false);
    ct.track(new Blog(), EntityState.Added);
    expect(ct.hasChanges()).toBe(true);
  });

  it("untrack removes the entry", () => {
    const ct = new ChangeTracker(model());
    const b = new Blog();
    b.Id = 1;
    const snap = Snapshot.take(b, model().findEntityType(Blog)!);
    const e = ct.track(b, EntityState.Unchanged, snap);
    ct.untrack(e);
    expect(ct.entries().length).toBe(0);
  });

  it("reload via provider refreshes the entity from server", async () => {
    const provider = new FakeStorageProvider();
    const m = model();
    const ct = new ChangeTracker(m, provider);

    // seed server side
    provider.seedRow(
      { kind: "title", value: "Blogs" },
      { Title: "ServerValue" },
    );

    // track an entity with stale local title
    const b = new Blog();
    b.Id = 1;
    b.Title = "Local";
    const entry = ct.track(
      b,
      EntityState.Unchanged,
      Snapshot.take(b, m.findEntityType(Blog)!),
    );
    entry.state = EntityState.Modified;

    await entry.reload();
    expect(b.Title).toBe("ServerValue");
    expect(entry.state).toBe(EntityState.Unchanged);
  });

  // entryFor() reads a WeakMap identity index rather than scanning _entries (track()
  // calls it per materialized row, so a linear scan made materialization quadratic).
  // These pin the index to _entries: what entryFor returns must match what is tracked.
  describe("entryFor identity index", () => {
    it("finds the entry for a tracked instance and misses an untracked one", () => {
      const ct = new ChangeTracker(model());
      const b = new Blog();
      b.Id = 1;
      const entry = ct.track(
        b,
        EntityState.Unchanged,
        Snapshot.take(b, model().findEntityType(Blog)!),
      );
      expect(ct.entryFor(b)).toBe(entry);
      expect(ct.entryFor(new Blog())).toBeUndefined();
    });

    it("untrack removes the instance from the index", () => {
      const ct = new ChangeTracker(model());
      const b = new Blog();
      b.Id = 1;
      const entry = ct.track(
        b,
        EntityState.Unchanged,
        Snapshot.take(b, model().findEntityType(Blog)!),
      );
      ct.untrack(entry);
      expect(ct.entryFor(b)).toBeUndefined();
      expect(ct.entries().length).toBe(0);
      // ...and the same instance can be tracked afresh afterwards.
      const retracked = ct.track(b, EntityState.Added);
      expect(ct.entryFor(b)).toBe(retracked);
    });

    it("clear resets the index (WeakMap has no clear(), so it must be reassigned)", () => {
      const ct = new ChangeTracker(model());
      const b = new Blog();
      b.Id = 1;
      ct.track(
        b,
        EntityState.Unchanged,
        Snapshot.take(b, model().findEntityType(Blog)!),
      );
      ct.clear();
      expect(ct.entryFor(b)).toBeUndefined();
      expect(ct.entries().length).toBe(0);
    });

    it("a Detached entry promoted by track() keeps one index slot, not two", () => {
      const ct = new ChangeTracker(model());
      const b = new Blog();
      b.Id = 1;
      const detached = ct.entry(b);
      expect(detached.state).toBe(EntityState.Detached);
      const promoted = ct.track(b, EntityState.Added);
      expect(promoted).toBe(detached);
      expect(ct.entryFor(b)).toBe(promoted);
      expect(ct.entries().length).toBe(1);
    });
  });
});
