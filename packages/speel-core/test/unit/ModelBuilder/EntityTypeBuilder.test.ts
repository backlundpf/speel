// test/unit/ModelBuilder/EntityTypeBuilder.test.ts
import { describe, it, expect } from "vitest";
import { EntityTypeBuilder } from "../../../src/ModelBuilder/EntityTypeBuilder.js";
import { ModelConfigurationException } from "../../../src/errors.js";
import type { IEntity } from "../../../src/types.js";

class Blog {
  Id?: number;
  Title?: string;
  ViewCount?: number;
  PublishedAt?: Date;
}

describe("EntityTypeBuilder", () => {
  it("toList accepts a bare string as a title", () => {
    const b = new EntityTypeBuilder(Blog).toList("Blogs");
    expect(b.getListHandle()).toEqual({ kind: "title", value: "Blogs" });
  });

  it("toList accepts { title } / { id } objects", () => {
    expect(
      new EntityTypeBuilder(Blog)
        .toList({ title: "Blog Posts" })
        .getListHandle(),
    ).toEqual({ kind: "title", value: "Blog Posts" });
    expect(
      new EntityTypeBuilder(Blog).toList({ id: "guid-x" }).getListHandle(),
    ).toEqual({ kind: "id", value: "guid-x" });
  });

  it("hasKey marks the chosen property as the key when built", () => {
    const b = new EntityTypeBuilder(Blog).toList("Blogs").hasKey((e) => e.Id);
    b.property((e) => e.Title).isText();
    const et = b.build();
    expect(et.key.propertyName).toBe("Id");
  });

  it("property returns a PropertyBuilder; build assembles the EntityType", () => {
    const b = new EntityTypeBuilder(Blog).toList("Blogs").hasKey((e) => e.Id);
    b.property((e) => e.Title)
      .isText()
      .isRequired()
      .hasMaxLength(120);
    b.property((e) => e.ViewCount)
      .isNumber()
      .hasMin(0);
    const et = b.build();
    expect(et.properties.map((p) => p.propertyName)).toEqual([
      "Id",
      "Title",
      "ViewCount",
    ]);
    const title = et.findProperty("Title")!;
    expect(title.config.kind).toBe("Text");
    if (title.config.kind === "Text") expect(title.config.maxLength).toBe(120);
  });

  it("throws if no toList was called", () => {
    const b = new EntityTypeBuilder(Blog).hasKey((e) => e.Id);
    expect(() => b.build()).toThrow(ModelConfigurationException);
  });

  it("throws if property selector resolves to no Is* call", () => {
    const b = new EntityTypeBuilder(Blog).toList("Blogs").hasKey((e) => e.Id);
    b.property((e) => e.Title); // no Is*
    expect(() => b.build()).toThrow(ModelConfigurationException);
  });

  it("throws on duplicate column names", () => {
    const b = new EntityTypeBuilder(Blog).toList("Blogs").hasKey((e) => e.Id);
    b.property((e) => e.Title)
      .isText()
      .hasColumnName("Same");
    b.property((e) => e.ViewCount)
      .isNumber()
      .hasColumnName("Same");
    expect(() => b.build()).toThrow(ModelConfigurationException);
  });

  it("auto-discovers Id property when hasKey was not called", () => {
    const b = new EntityTypeBuilder(Blog).toList("Blogs");
    b.property((e) => e.Title).isText();
    const et = b.build();
    expect(et.key.propertyName).toBe("Id");
  });

  it("throws if no hasKey and no Id property exists", () => {
    class NoId {
      Title?: string;
    }
    const b = new EntityTypeBuilder<NoId & IEntity>(NoId).toList("X");
    b.property((e) => e.Title).isText();
    expect(() => b.build()).toThrow(ModelConfigurationException);
  });
});
