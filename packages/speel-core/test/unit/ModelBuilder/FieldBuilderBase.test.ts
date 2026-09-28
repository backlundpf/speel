import { describe, it, expect } from "vitest";
import { FieldBuilderBase } from "../../../src/ModelBuilder/fieldTypes/FieldBuilderBase.js";
import type { FieldConfig } from "../../../src/Metadata/FieldConfig.js";

class TestBuilder extends FieldBuilderBase<TestBuilder> {
  protected self(): TestBuilder {
    return this;
  }
  protected emitConfig(): FieldConfig {
    return { kind: "Text", maxLength: 255 };
  }
}

describe("FieldBuilderBase", () => {
  it("returns this from each refinement (chaining)", () => {
    const b = new TestBuilder();
    expect(b.isRequired()).toBe(b);
    expect(b.hasColumnName("X")).toBe(b);
    expect(b.hasDisplayName("Y")).toBe(b);
    expect(b.hasDescription("Z")).toBe(b);
    expect(b.hasDefaultValue("d")).toBe(b);
    expect(b.isIndexed()).toBe(b);
    expect(b.isReadOnly()).toBe(b);
  });

  it("build composes settings into a Property", () => {
    const b = new TestBuilder()
      .isRequired()
      .hasColumnName("Title")
      .hasDisplayName("Title display")
      .hasDescription("the title")
      .hasDefaultValue("Untitled")
      .isIndexed();
    const p = b.build("Title", /* isKey */ false);
    expect(p.propertyName).toBe("Title");
    expect(p.columnName).toBe("Title");
    expect(p.displayName).toBe("Title display");
    expect(p.description).toBe("the title");
    expect(p.config.kind).toBe("Text");
    expect(p.required).toBe(true);
    expect(p.readOnly).toBe(false);
    expect(p.indexed).toBe(true);
    expect(p.defaultValue).toBe("Untitled");
  });

  it("isRequired(false), isReadOnly(false) flip back", () => {
    const b = new TestBuilder()
      .isRequired()
      .isRequired(false)
      .isReadOnly()
      .isReadOnly(false);
    const p = b.build("X", false);
    expect(p.required).toBe(false);
    expect(p.readOnly).toBe(false);
  });

  it("defaults: columnName=propertyName, displayName=propertyName, isRequired=false", () => {
    const b = new TestBuilder();
    const p = b.build("Foo", false);
    expect(p.columnName).toBe("Foo");
    expect(p.displayName).toBe("Foo");
    expect(p.required).toBe(false);
    expect(p.readOnly).toBe(false);
  });
});
