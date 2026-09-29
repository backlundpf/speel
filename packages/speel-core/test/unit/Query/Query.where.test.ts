// test/unit/Query/Query.where.test.ts
import { describe, it, expect } from "vitest";
import { Query } from "../../../src/Query/Query.js";
import { QueryExecutor } from "../../../src/Query/QueryExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { Model } from "../../../src/Metadata/Model.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";

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
    config: { kind: "Text", multiline: false, maxLength: 255 },
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
  const executor = new QueryExecutor<Blog>(provider, tracker);
  const base = Query.empty<Blog>(et, executor);
  return { et, base };
}

describe("Query.where", () => {
  it("stores the filter in state", () => {
    const { base } = setup();
    const q = base.where((b) => b.Title.eq("Hello"));
    expect(q.state.filter).toEqual({
      kind: "compare",
      column: "Title",
      op: "eq",
      value: "Hello",
    });
  });

  it("AND-combines successive where calls", () => {
    const { base } = setup();
    const q = base
      .where((b) => b.Title.eq("Hello"))
      .where((b) => b.ViewCount.gt(0));
    expect(q.state.filter).toEqual({
      kind: "and",
      children: [
        { kind: "compare", column: "Title", op: "eq", value: "Hello" },
        { kind: "compare", column: "ViewCount", op: "gt", value: 0 },
      ],
    });
  });

  it("chain immutability: original Query unchanged", () => {
    const { base } = setup();
    const q1 = base.where((b) => b.Title.eq("A"));
    const q2 = q1.where((b) => b.ViewCount.gt(5));
    expect(q1).not.toBe(q2);
    expect(q1.state.filter).toEqual({
      kind: "compare",
      column: "Title",
      op: "eq",
      value: "A",
    });
  });
});
