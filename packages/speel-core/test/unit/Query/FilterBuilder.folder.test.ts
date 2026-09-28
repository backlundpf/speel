import { describe, it, expect } from "vitest";
import { createFilterBuilder } from "../../../src/Query/FilterBuilder.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { InvalidOperationException } from "../../../src/errors.js";

class Doc {
  Id?: number;
  Title?: string;
}
class Odd {
  Id?: number;
  inFolder?: string;
}

function et(ctor: new () => object, extra: Property[] = []): EntityType {
  const id = new Property({
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
    list: { kind: "title", value: "Docs" },
    properties: [id, ...extra],
  });
}

describe("FilterBuilder folder methods", () => {
  it("inFolder builds a normalized exact container-scope node", () => {
    const b = createFilterBuilder<Doc>(et(Doc) as never);
    expect(b.inFolder("/reports//2026/")).toEqual({
      kind: "container-scope",
      path: "reports/2026",
      recursive: false,
    });
  });

  it("inFolder honors { recursive: true }", () => {
    const b = createFilterBuilder<Doc>(et(Doc) as never);
    expect(b.inFolder("reports", { recursive: true })).toEqual({
      kind: "container-scope",
      path: "reports",
      recursive: true,
    });
  });

  it("inFolder rejects empty-after-normalization and traversal paths", () => {
    const b = createFilterBuilder<Doc>(et(Doc) as never);
    expect(() => b.inFolder("  /// ")).toThrow(InvalidOperationException);
    expect(() => b.inFolder("a/../b")).toThrow(InvalidOperationException);
  });

  it("includeFolders builds the marker node", () => {
    const b = createFilterBuilder<Doc>(et(Doc) as never);
    expect(b.includeFolders()).toEqual({ kind: "include-containers" });
  });

  it("reserves the names: a property called inFolder is shadowed in the builder", () => {
    const prop = new Property({
      propertyName: "inFolder",
      columnName: "inFolder",
      displayName: "inFolder",
      config: { kind: "Text", multiline: false },
      required: false,
      readOnly: false,
      key: false,
    });
    const b = createFilterBuilder<Odd>(et(Odd, [prop]) as never);
    // The reserved method wins over the mapped property filter.
    expect(typeof b.inFolder).toBe("function");
    expect(b.inFolder("a")).toEqual({
      kind: "container-scope",
      path: "a",
      recursive: false,
    });
  });
});
