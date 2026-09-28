import { describe, it, expect } from "vitest";
import { PropertyBuilder } from "../../../src/ModelBuilder/PropertyBuilder.js";
import { TextFieldBuilder } from "../../../src/ModelBuilder/fieldTypes/TextFieldBuilder.js";
import { NumberFieldBuilder } from "../../../src/ModelBuilder/fieldTypes/NumberFieldBuilder.js";

describe("PropertyBuilder", () => {
  it("isText returns a TextFieldBuilder", () => {
    const pb = new PropertyBuilder<string>("Title");
    const tb = pb.isText();
    expect(tb).toBeInstanceOf(TextFieldBuilder);
  });

  it("records the selected builder so the entity builder can find it", () => {
    const pb = new PropertyBuilder<number>("Views");
    pb.isNumber();
    expect(pb.getTypeBuilder()).toBeInstanceOf(NumberFieldBuilder);
    expect(pb.propertyName).toBe("Views");
  });

  it("getTypeBuilder returns undefined before any Is* call", () => {
    const pb = new PropertyBuilder<string>("Foo");
    expect(pb.getTypeBuilder()).toBeUndefined();
  });

  it("two different field types on one property throws", () => {
    const pb = new PropertyBuilder<string>("X");
    pb.isText();
    expect(() => pb.isNumber()).toThrow();
  });

  it("isText then isNote is idempotent (Note is multiline Text — same builder)", () => {
    const pb = new PropertyBuilder<string>("X");
    const a = pb.isText();
    expect(() => pb.isNote()).not.toThrow();
    expect(pb.isNote()).toBe(a);
  });
});
