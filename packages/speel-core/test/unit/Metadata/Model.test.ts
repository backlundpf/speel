import { describe, it, expect } from "vitest";
import { Model } from "../../../src/Metadata/Model.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";

class Blog {
  Id?: number;
}
class Comment {
  Id?: number;
}

function et(ctor: new () => unknown, listName: string): EntityType {
  const key = new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });
  return new EntityType({
    ctor: ctor as never,
    list: { kind: "title", value: listName },
    properties: [key],
  });
}

describe("Model", () => {
  it("lookup by ctor", () => {
    const b = et(Blog, "Blogs");
    const c = et(Comment, "Comments");
    const m = new Model([b, c]);
    expect(m.findEntityType(Blog)).toBe(b);
    expect(m.findEntityType(Comment)).toBe(c);
  });

  it("throws on two entity types mapped to the same list", () => {
    const b = et(Blog, "Lists");
    const c = et(Comment, "Lists");
    expect(() => new Model([b, c])).toThrow();
  });

  it("throws on duplicate ctor registration", () => {
    const a = et(Blog, "A");
    const b = et(Blog, "B");
    expect(() => new Model([a, b])).toThrow();
  });

  it("entityTypes is readonly", () => {
    const b = et(Blog, "Blogs");
    const m = new Model([b]);
    expect(() => {
      (m.entityTypes as EntityType[]).push(b);
    }).toThrow();
  });
});
