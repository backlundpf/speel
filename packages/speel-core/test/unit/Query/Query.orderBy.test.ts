// test/unit/Query/Query.orderBy.test.ts
import { describe, it, expect } from "vitest";
import { Query } from "../../../src/Query/Query.js";
import { QueryExecutor } from "../../../src/Query/QueryExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { Model } from "../../../src/Metadata/Model.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { InvalidOperationException } from "../../../src/errors.js";

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
  const base = Query.empty<Blog>(
    et,
    new QueryExecutor<Blog>(provider, tracker),
  );
  return { base };
}

describe("Query.orderBy / thenBy", () => {
  it("orderBy replaces orderBy state", () => {
    const { base } = setup();
    const q = base.orderBy((b) => b.ViewCount, "desc");
    expect(q.state.orderBy).toEqual([
      { column: "ViewCount", direction: "desc" },
    ]);
  });

  it("orderBy default direction is asc", () => {
    const { base } = setup();
    const q = base.orderBy((b) => b.Title);
    expect(q.state.orderBy).toEqual([{ column: "Title", direction: "asc" }]);
  });

  it("orderBy called twice replaces (does not append)", () => {
    const { base } = setup();
    const q = base.orderBy((b) => b.Title).orderBy((b) => b.ViewCount, "desc");
    expect(q.state.orderBy).toEqual([
      { column: "ViewCount", direction: "desc" },
    ]);
  });

  it("thenBy appends to orderBy", () => {
    const { base } = setup();
    const q = base.orderBy((b) => b.Title).thenBy((b) => b.ViewCount, "desc");
    expect(q.state.orderBy).toEqual([
      { column: "Title", direction: "asc" },
      { column: "ViewCount", direction: "desc" },
    ]);
  });

  it("thenBy without prior orderBy throws InvalidOperationException", () => {
    const { base } = setup();
    expect(() => base.thenBy((b) => b.Title)).toThrow(
      InvalidOperationException,
    );
  });
});
