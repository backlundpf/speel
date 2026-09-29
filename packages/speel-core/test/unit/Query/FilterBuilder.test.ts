// test/unit/Query/FilterBuilder.test.ts
import { describe, it, expect } from "vitest";
import {
  createFilterBuilder,
  PropertyFilter,
  type FilterBuilder,
} from "../../../src/Query/FilterBuilder.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { ModelConfigurationException } from "../../../src/errors.js";

class Blog {
  Id?: number;
  Title?: string;
  ViewCount?: number;
}

function et(): EntityType<Blog> {
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
  return new EntityType<Blog>({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [id, title, views],
  });
}

describe("FilterBuilder Proxy", () => {
  it("returns a PropertyFilter for a configured property", () => {
    const b = createFilterBuilder(et()) as unknown as { Title: PropertyFilter };
    expect(b.Title).toBeInstanceOf(PropertyFilter);
    expect(b.Title._property.propertyName).toBe("Title");
  });

  it("throws ModelConfigurationException for an unmapped property", () => {
    const b = createFilterBuilder(et()) as unknown as Record<string, unknown>;
    expect(() => b["NotAField"]).toThrow(ModelConfigurationException);
  });

  it("does not throw for symbol access (e.g., Symbol.toPrimitive checks)", () => {
    const b = createFilterBuilder(et()) as unknown as object;
    expect(
      () => (b as Record<symbol, unknown>)[Symbol.toPrimitive],
    ).not.toThrow();
  });
});
