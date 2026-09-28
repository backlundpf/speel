// test/unit/DbSet.query.test.ts
import { describe, it, expect } from "vitest";
import { DbSet } from "../../src/DbSet.js";
import { Query } from "../../src/Query/Query.js";
import { ChangeTracker } from "../../src/ChangeTracker/ChangeTracker.js";
import { Model } from "../../src/Metadata/Model.js";
import { EntityType } from "../../src/Metadata/EntityType.js";
import { Property } from "../../src/Metadata/Property.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";

class Blog {
  Id?: number;
  Title?: string;
  ViewCount?: number;
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
    config: { kind: "Text", maxLength: 255 },
    required: false,
    readOnly: false,
    key: false,
  });
  const views = new Property({
    propertyName: "ViewCount",
    columnName: "ViewCount",
    displayName: "ViewCount",
    config: { kind: "Number" },
    required: false,
    readOnly: false,
    key: false,
  });
  const et = new EntityType<Blog>({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [id, title, views],
  });
  const model = new Model([et]);
  const provider = new FakeStorageProvider();
  const tracker = new ChangeTracker(model, provider);
  const set = new DbSet<Blog>(Blog, model, provider, tracker);
  return { set, provider };
}

describe("DbSet IQuery delegation", () => {
  it("where returns a Query<Blog>", () => {
    const q = setup().set.where((b) => b.Title.eq("A"));
    expect(q).toBeInstanceOf(Query);
  });

  it("orderBy returns a Query<Blog>", () => {
    const q = setup().set.orderBy((b) => b.Title);
    expect(q).toBeInstanceOf(Query);
  });

  it("take/skip/asNoTracking all return Query<Blog>", () => {
    const { set } = setup();
    expect(set.take(5)).toBeInstanceOf(Query);
    expect(set.skip(5)).toBeInstanceOf(Query);
    expect(set.asNoTracking()).toBeInstanceOf(Query);
  });

  it("toArrayAsync on chain returns filtered list", async () => {
    const { set, provider } = setup();
    for (let i = 1; i <= 5; i++) {
      provider.seedRow(
        { kind: "title", value: "Blogs" },
        { Title: `T${i}`, ViewCount: i * 10 },
      );
    }
    const r = await set
      .where((b) => b.ViewCount.gt(20))
      .orderBy((b) => b.ViewCount, "desc")
      .toArrayAsync();
    expect(r.map((b) => b.Title)).toEqual(["T5", "T4", "T3"]);
  });

  it("countAsync on DbSet directly returns total", async () => {
    const { set, provider } = setup();
    for (let i = 1; i <= 3; i++) {
      provider.seedRow({ kind: "title", value: "Blogs" }, { Title: `T${i}` });
    }
    expect(await set.countAsync()).toBe(3);
  });
});
