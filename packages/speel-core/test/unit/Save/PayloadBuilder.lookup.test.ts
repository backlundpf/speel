import { describe, it, expect } from "vitest";
import { PayloadBuilder } from "../../../src/Save/PayloadBuilder.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import type { IWriteField } from "../../../src/providers/ISharePointProvider.js";

class Blog3 {
  Id?: number;
  Title?: string;
  AuthorId?: number;
  TagsId?: number[];
}

function blogEt(): EntityType<Blog3> {
  return new EntityType<Blog3>({
    ctor: Blog3,
    list: { kind: "title", value: "Blogs" },
    properties: [
      new Property({
        propertyName: "Id",
        columnName: "ID",
        displayName: "ID",
        config: { kind: "Number" },
        required: true,
        readOnly: true,
        key: true,
      }),
      new Property({
        propertyName: "Title",
        columnName: "Title",
        displayName: "Title",
        config: { kind: "Text", maxLength: 255 },
        required: false,
        readOnly: false,
        key: false,
      }),
      new Property({
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
      }),
      new Property({
        propertyName: "TagsId",
        columnName: "TagsId",
        displayName: "TagsId",
        config: {
          kind: "Lookup",
          target: undefined as unknown as EntityType,
          displayField: "Title",
          multi: true,
        },
        required: false,
        readOnly: false,
        key: false,
      }),
    ],
  });
}

function byColumn(fields: readonly IWriteField[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((f) => [f.property.columnName, f.value]),
  );
}

describe("PayloadBuilder Lookup/User", () => {
  it("single Lookup is the id, under the FK column's own Property", () => {
    const type = blogEt();
    const e = new Blog3();
    e.Title = "X";
    e.AuthorId = 5;
    const fields = PayloadBuilder.buildForAdd(e, type);
    expect(byColumn(fields)).toEqual({ Title: "X", AuthorId: 5 });
    expect(fields[1]!.property).toBe(type.findProperty("AuthorId"));
  });
  it("multi-value Lookup is the id array — the provider spells the wire", () => {
    const e = new Blog3();
    e.TagsId = [1, 2];
    expect(byColumn(PayloadBuilder.buildForAdd(e, blogEt()))).toEqual({
      TagsId: [1, 2],
    });
  });
  it("explicit empty multi-value Lookup is carried as an empty array", () => {
    const e = new Blog3();
    e.TagsId = [];
    expect(byColumn(PayloadBuilder.buildForAdd(e, blogEt()))).toEqual({
      TagsId: [],
    });
  });
  it("omits multi-value Lookup when undefined", () => {
    const e = new Blog3();
    e.Title = "X";
    expect(byColumn(PayloadBuilder.buildForAdd(e, blogEt()))).toEqual({
      Title: "X",
    });
  });
  it("buildForUpdate respects dirty set + Lookup shapes", () => {
    const e = new Blog3();
    e.TagsId = [9];
    e.Title = "X";
    e.AuthorId = 4;
    expect(
      byColumn(PayloadBuilder.buildForUpdate(e, blogEt(), ["TagsId"])),
    ).toEqual({ TagsId: [9] });
    expect(
      byColumn(PayloadBuilder.buildForUpdate(e, blogEt(), ["AuthorId"])),
    ).toEqual({ AuthorId: 4 });
  });
});
