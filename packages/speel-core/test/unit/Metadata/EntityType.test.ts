// test/unit/Metadata/EntityType.test.ts
import { describe, it, expect } from "vitest";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import type { INavigation } from "../../../src/Metadata/Navigation.js";

class Blog {
  Id?: number;
  Title?: string;
  AuthorId?: number;
  Author?: object;
}

const idProp = new Property({
  propertyName: "Id",
  columnName: "ID",
  displayName: "ID",
  config: { kind: "Number" },
  required: true,
  readOnly: true,
  key: true,
});
const titleProp = new Property({
  propertyName: "Title",
  columnName: "Title",
  displayName: "Title",
  config: { kind: "Text", multiline: false, maxLength: 255 },
  required: true,
  readOnly: false,
  key: false,
});

describe("EntityType metadata", () => {
  it("exposes ctor, list handle, key and properties", () => {
    const et = new EntityType({
      ctor: Blog,
      list: { kind: "title", value: "Blogs" },
      properties: [idProp, titleProp],
    });
    expect(et.ctor).toBe(Blog);
    expect(et.list).toEqual({ kind: "title", value: "Blogs" });
    expect(et.key).toBe(idProp);
    expect(et.properties).toEqual([idProp, titleProp]);
  });

  it("throws if no property is marked isKey", () => {
    expect(
      () =>
        new EntityType({
          ctor: Blog,
          list: { kind: "title", value: "Blogs" },
          properties: [titleProp],
        }),
    ).toThrow();
  });

  it("findProperty returns by property name", () => {
    const et = new EntityType({
      ctor: Blog,
      list: { kind: "title", value: "Blogs" },
      properties: [idProp, titleProp],
    });
    expect(et.findProperty("Title")).toBe(titleProp);
    expect(et.findProperty("Missing")).toBeUndefined();
  });

  it("columnNames returns the SP internal names", () => {
    const et = new EntityType({
      ctor: Blog,
      list: { kind: "title", value: "Blogs" },
      properties: [idProp, titleProp],
    });
    expect(et.columnNames).toEqual(["ID", "Title"]);
  });
});

describe("EntityType navigations", () => {
  const authorIdProp = new Property({
    propertyName: "AuthorId",
    columnName: "AuthorId",
    displayName: "AuthorId",
    config: {
      kind: "Lookup",
      target: undefined as unknown as EntityType,
      displayField: "Title",
      multi: false,
    },
    required: false,
    readOnly: false,
    key: false,
  });

  function makeEntityType(): EntityType<Blog> {
    return new EntityType<Blog>({
      ctor: Blog,
      list: { kind: "title", value: "Blogs" },
      properties: [idProp, authorIdProp],
    });
  }

  it("navigations() returns [] when none added", () => {
    const et = makeEntityType();
    expect(et.navigations()).toEqual([]);
  });

  it("findNavigation returns undefined for unknown name", () => {
    const et = makeEntityType();
    expect(et.findNavigation("Author")).toBeUndefined();
  });

  it("addNavigation registers a nav lookable by name", () => {
    const et = makeEntityType();
    const fk = et.findProperty("AuthorId")!;
    const nav: INavigation = {
      name: "Author",
      columnName: "Author",
      displayName: "Author",
      required: false,
      visible: true,
      enabled: true,
      readOnly: false,
      systemGenerated: false,
      customValidations: [],
      kind: "reference",
      storage: "self-fk-scalar",
      target: et as unknown as EntityType,
      foreignKey: fk,
      config: {
        kind: "Lookup",
        target: et as unknown as EntityType,
        displayField: "Title",
        multi: false,
      },
    };
    et.addNavigation(nav);
    expect(et.findNavigation("Author")).toBe(nav);
    expect(et.navigations()).toEqual([nav]);
  });
});
