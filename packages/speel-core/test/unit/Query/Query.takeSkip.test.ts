// test/unit/Query/Query.takeSkip.test.ts
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
  const et = new EntityType<Blog>({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [id],
  });
  const model = new Model([et]);
  const provider = new FakeStorageProvider();
  const tracker = new ChangeTracker(model, provider);
  return {
    base: Query.empty<Blog>(et, new QueryExecutor<Blog>(provider, tracker)),
  };
}

describe("Query take / skip / asNoTracking", () => {
  it("take stores the value", () => {
    expect(setup().base.take(5).state.take).toBe(5);
  });
  it("take is non-cumulative: last call wins", () => {
    expect(setup().base.take(5).take(10).state.take).toBe(10);
  });
  it("skip stores the value", () => {
    expect(setup().base.skip(20).state.skip).toBe(20);
  });
  it("skip is non-cumulative: last call wins", () => {
    expect(setup().base.skip(5).skip(10).state.skip).toBe(10);
  });
  it("asNoTracking sets noTracking flag true", () => {
    expect(setup().base.asNoTracking().state.noTracking).toBe(true);
  });
  it("default state has noTracking false", () => {
    expect(setup().base.state.noTracking).toBe(false);
  });
});
