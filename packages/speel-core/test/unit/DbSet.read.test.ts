// test/unit/DbSet.read.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { DbSet } from "../../src/DbSet.js";
import { ChangeTracker } from "../../src/ChangeTracker/ChangeTracker.js";
import { Model } from "../../src/Metadata/Model.js";
import { EntityType } from "../../src/Metadata/EntityType.js";
import { Property } from "../../src/Metadata/Property.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";

class Blog {
  Id?: number;
  Title?: string;
}

function modelAndProvider() {
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
  const et = new EntityType<Blog>({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [id, title],
  });
  const model = new Model([et]);
  const provider = new FakeStorageProvider();
  return { model, provider, et };
}

describe("DbSet read API", () => {
  let model: Model,
    provider: FakeStorageProvider,
    tracker: ChangeTracker,
    set: DbSet<Blog>;

  beforeEach(async () => {
    ({ model, provider } = modelAndProvider());
    tracker = new ChangeTracker(model);
    set = new DbSet<Blog>(Blog, model, provider, tracker);
    // seed 3 items
    for (let i = 1; i <= 3; i++) {
      provider.seedRow({ kind: "title", value: "Blogs" }, { Title: `T${i}` });
    }
  });

  it("findAsync returns null for missing", async () => {
    expect(await set.findAsync(999)).toBeNull();
  });

  it("findAsync returns a tracked Unchanged entity for hit", async () => {
    const b = await set.findAsync(1);
    expect(b).not.toBeNull();
    expect(b!.Id).toBe(1);
    expect(b!.Title).toBe("T1");
    expect(tracker.entries(Blog)[0]!.state).toBe("Unchanged");
  });

  it("findAsync uses identity map on second call", async () => {
    const a = await set.findAsync(1);
    const b = await set.findAsync(1);
    expect(a).toBe(b);
    expect(tracker.entries(Blog).length).toBe(1);
  });

  it("toArrayAsync returns all items", async () => {
    const all = await set.toArrayAsync();
    expect(all.length).toBe(3);
    expect(all.map((b) => b.Id)).toEqual([1, 2, 3]);
  });

  it("toArrayAsync hits identity map for already-tracked items", async () => {
    const one = await set.findAsync(1);
    const all = await set.toArrayAsync();
    expect(all.find((b) => b.Id === 1)).toBe(one);
  });

  it("toArrayAsync returns all items without any cap", async () => {
    // beforeEach seeded 3 items; add 9 more to reach 12 total
    for (let i = 4; i <= 12; i++) {
      provider.seedRow({ kind: "title", value: "Blogs" }, { Title: `T${i}` });
    }
    const all = await set.toArrayAsync();
    expect(all.length).toBe(12);
  });
});
