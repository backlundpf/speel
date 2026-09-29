// test/unit/DbSet.write.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { DbSet } from "../../src/DbSet.js";
import { ChangeTracker } from "../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../src/ChangeTracker/EntityEntry.js";
import { Model } from "../../src/Metadata/Model.js";
import { EntityType } from "../../src/Metadata/EntityType.js";
import { Property } from "../../src/Metadata/Property.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import { InvalidOperationException } from "../../src/errors.js";

class Blog {
  Id?: number;
  Title?: string;
  Created?: Date;
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
  const created = new Property({
    propertyName: "Created",
    columnName: "Created",
    displayName: "Created",
    config: {
      kind: "DateTime",
      displayFormat: "DateTime",
      friendlyFormat: "Disabled",
    },
    required: false,
    readOnly: true,
    key: false,
  });
  const et = new EntityType<Blog>({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [id, title, created],
  });
  const model = new Model([et]);
  const provider = new FakeStorageProvider();
  const tracker = new ChangeTracker(model);
  const set = new DbSet<Blog>(Blog, model, provider, tracker);
  return { set, tracker };
}

describe("DbSet write API", () => {
  let set: DbSet<Blog>, tracker: ChangeTracker;
  beforeEach(() => {
    ({ set, tracker } = setup());
  });

  it("add tracks the entity as Added", () => {
    const b = new Blog();
    b.Title = "x";
    const e = set.add(b);
    expect(e.state).toBe(EntityState.Added);
    expect(tracker.entries(Blog)[0]!.entity).toBe(b);
  });

  it("add throws if Id is set", () => {
    const b = new Blog();
    b.Id = 5;
    expect(() => set.add(b)).toThrow(InvalidOperationException);
  });

  it("add throws when a read-only property has a non-undefined value", () => {
    const b = new Blog();
    b.Title = "x";
    b.Created = new Date();
    expect(() => set.add(b)).toThrow(InvalidOperationException);
  });

  it("attach tracks as Unchanged with snapshot of current values", () => {
    const b = new Blog();
    b.Id = 1;
    b.Title = "x";
    const e = set.attach(b);
    expect(e.state).toBe(EntityState.Unchanged);
    b.Title = "y";
    expect(e.getDirtyColumns()).toEqual(["Title"]);
  });

  it("attach throws if entity already tracked", () => {
    const b = new Blog();
    b.Id = 1;
    set.attach(b);
    expect(() => set.attach(b)).toThrow(InvalidOperationException);
  });

  it("update attaches and marks Modified with all configured properties dirty", () => {
    const b = new Blog();
    b.Id = 1;
    b.Title = "x";
    const e = set.update(b);
    expect(e.state).toBe(EntityState.Modified);
    expect(e.getDirtyColumns().sort()).toEqual(["Title"]);
  });

  it("remove on Added entry untracks it", () => {
    const b = new Blog();
    b.Title = "x";
    set.add(b);
    set.remove(b);
    expect(tracker.entries().length).toBe(0);
  });

  it("remove on tracked entity sets Deleted", () => {
    const b = new Blog();
    b.Id = 1;
    b.Title = "x";
    set.attach(b);
    set.remove(b);
    expect(tracker.entries(Blog)[0]!.state).toBe(EntityState.Deleted);
  });

  it("remove on untracked entity (with Id) attaches and marks Deleted", () => {
    const b = new Blog();
    b.Id = 99;
    set.remove(b);
    expect(tracker.entries(Blog)[0]!.state).toBe(EntityState.Deleted);
  });

  it("remove on untracked entity without Id throws", () => {
    const b = new Blog();
    expect(() => set.remove(b)).toThrow(InvalidOperationException);
  });

  // REGRESSION: entry() creates a Detached bookkeeping entry, which entries() returns.
  // The id-less lookup must ignore it — otherwise remove() marks an id-less Detached
  // entry Deleted and the failure resurfaces at save as a DbUpdateException with an
  // undefined id. useEntityForm calls entry() on every form, add-mode included, so a
  // discard flow over a never-saved entity hits exactly this.
  it("remove on an entity with only a Detached entry (from entry()) still throws", () => {
    const b = new Blog();
    tracker.entry(b);
    expect(tracker.entries(Blog)[0]!.state).toBe(EntityState.Detached);
    expect(() => set.remove(b)).toThrow(
      /requires the entity to be tracked or to have an Id/,
    );
    expect(tracker.entries(Blog)[0]!.state).toBe(EntityState.Detached);
  });

  it("add resurrects a Deleted entity to Modified", () => {
    const b = new Blog();
    b.Id = 1;
    b.Title = "x";
    set.attach(b);
    set.remove(b);
    expect(set.add(b).state).toBe(EntityState.Modified);
  });
});
