import { describe, it, expect } from "vitest";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { Model } from "../../../src/Metadata/Model.js";
import {
  InvalidOperationException,
  ModelConfigurationException,
} from "../../../src/errors.js";

class L {
  Id?: number;
}
class P {
  Id?: number;
}

const idProp = () =>
  new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });

describe("EntityType.source", () => {
  it("list init produces a list source and a working .list getter", () => {
    const et = new EntityType<L>({
      ctor: L,
      list: { kind: "title", value: "Things" },
      properties: [idProp()],
    });
    expect(et.source).toEqual({
      kind: "list",
      list: { kind: "title", value: "Things" },
    });
    expect(et.list).toEqual({ kind: "title", value: "Things" });
  });

  it("provider source: .list throws, sourceHandle is the source", () => {
    const et = new EntityType<P>({
      ctor: P,
      source: { kind: "provider", key: "principals" },
      properties: [idProp()],
    });
    expect(et.source.kind).toBe("provider");
    expect(et.sourceHandle).toEqual({ kind: "provider", key: "principals" });
    expect(() => et.list).toThrow(InvalidOperationException);
  });

  it("Model allows multiple non-list sources without a list-uniqueness clash", () => {
    const a = new EntityType<P>({
      ctor: P,
      source: { kind: "provider", key: "siteUsers" },
      properties: [idProp()],
    });
    const b = new EntityType<L>({
      ctor: L,
      source: { kind: "provider", key: "siteGroups" },
      properties: [idProp()],
    });
    expect(() => new Model([a, b])).not.toThrow();
  });

  it("construction with neither source nor list throws", () => {
    expect(
      () => new EntityType<L>({ ctor: L, properties: [idProp()] } as never),
    ).toThrow(ModelConfigurationException);
  });

  it("providing both source and list throws", () => {
    expect(
      () =>
        new EntityType<L>({
          ctor: L,
          source: { kind: "provider", key: "principals" },
          list: { kind: "title", value: "X" },
          properties: [idProp()],
        }),
    ).toThrow(ModelConfigurationException);
  });

  it.each(["siteUsers", "siteGroups"] as const)(
    "provider source '%s': .list throws naming the key",
    (key) => {
      const et = new EntityType<P>({
        ctor: P,
        source: { kind: "provider", key },
        properties: [idProp()],
      });
      expect(() => et.list).toThrow(InvalidOperationException);
      expect(() => et.list).toThrow(new RegExp(`provider '${key}'`));
    },
  );
});
