import { describe, it, expect } from "vitest";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import {
  InvalidOperationException,
  ModelConfigurationException,
} from "../../../src/errors.js";

class Shape {}
class Row {}

const text = (name: string, key = false): Property =>
  new Property({
    propertyName: name,
    columnName: name,
    displayName: name,
    config: { kind: "Text", multiline: false },
    required: false,
    readOnly: false,
    key,
  });

describe("an embedded entity type", () => {
  it("builds with no key property", () => {
    const et = new EntityType({
      ctor: Shape as never,
      source: { kind: "embedded" },
      properties: [text("Title")],
    });
    expect(et.isEmbedded).toBe(true);
    expect(et.properties.map((p) => p.propertyName)).toEqual(["Title"]);
  });

  it("throws on key access, the way a provider source throws on list access", () => {
    const et = new EntityType({
      ctor: Shape as never,
      source: { kind: "embedded" },
      properties: [text("Title")],
    });
    // A shape has no rows, so nothing that tracks, saves or caches one should
    // ever reach for its key — and if something does, it says so loudly. The
    // same exception its siblings raise: `list` and `sourceHandle` answer this
    // read-time "not that kind of type" the same way.
    expect(() => et.key).toThrow(InvalidOperationException);
    expect(() => et.key).toThrow(/Shape/);
    expect(() => et.key).toThrow(/embedded/);
  });

  it("still requires exactly one key for a list-backed entity", () => {
    expect(
      () =>
        new EntityType({
          ctor: Row as never,
          list: { kind: "title", value: "Rows" },
          properties: [text("Title")],
        }),
    ).toThrow(ModelConfigurationException);
  });

  it("rejects a key property on an embedded type", () => {
    expect(
      () =>
        new EntityType({
          ctor: Shape as never,
          source: { kind: "embedded" },
          properties: [text("Id", true)],
        }),
    ).toThrow(/cannot have a key/);
  });
});
