// test/unit/Query/PropertyFilter.test.ts
import { describe, it, expect } from "vitest";
import { PropertyFilter } from "../../../src/Query/FilterBuilder.js";
import { Property } from "../../../src/Metadata/Property.js";

const stringProp = new Property({
  propertyName: "Title",
  columnName: "Title",
  displayName: "Title",
  config: { kind: "Text", maxLength: 255 },
  required: false,
  readOnly: false,
  key: false,
});
const numberProp = new Property({
  propertyName: "ViewCount",
  columnName: "ViewCount",
  displayName: "ViewCount",
  config: { kind: "Number" },
  required: false,
  readOnly: false,
  key: false,
});
const boolProp = new Property({
  propertyName: "IsPublished",
  columnName: "IsPublished",
  displayName: "IsPublished",
  config: { kind: "Boolean" },
  required: false,
  readOnly: false,
  key: false,
});
const dateProp = new Property({
  propertyName: "PublishedAt",
  columnName: "PublishedAt",
  displayName: "PublishedAt",
  config: {
    kind: "DateTime",
    displayFormat: "DateTime",
    friendlyFormat: "Disabled",
  },
  required: false,
  readOnly: false,
  key: false,
});
const multiProp = new Property({
  propertyName: "Tags",
  columnName: "Tags",
  displayName: "Tags",
  config: {
    kind: "Choice",
    multi: true,
    options: ["a", "b"],
    fillIn: false,
    radioButtons: false,
  },
  required: false,
  readOnly: false,
  key: false,
});

describe("PropertyFilter universal ops", () => {
  it("eq produces a compare node", () => {
    expect(new PropertyFilter(stringProp).eq("Hello")).toEqual({
      kind: "compare",
      column: "Title",
      op: "eq",
      value: "Hello",
    });
  });
  it("ne produces a compare node", () => {
    expect(new PropertyFilter(stringProp).ne("Hello")).toEqual({
      kind: "compare",
      column: "Title",
      op: "ne",
      value: "Hello",
    });
  });
  it("isNull / isNotNull", () => {
    expect(new PropertyFilter(stringProp).isNull()).toEqual({
      kind: "is-null",
      column: "Title",
      negate: false,
    });
    expect(new PropertyFilter(stringProp).isNotNull()).toEqual({
      kind: "is-null",
      column: "Title",
      negate: true,
    });
  });
});

describe("PropertyFilter string ops", () => {
  it("startsWith / endsWith / contains", () => {
    const p = new PropertyFilter(stringProp);
    expect(p.startsWith("H")).toEqual({
      kind: "string",
      column: "Title",
      op: "startsWith",
      value: "H",
    });
    expect(p.endsWith("o")).toEqual({
      kind: "string",
      column: "Title",
      op: "endsWith",
      value: "o",
    });
    expect(p.contains("ell")).toEqual({
      kind: "string",
      column: "Title",
      op: "contains",
      value: "ell",
    });
  });
  it("in / notIn", () => {
    const p = new PropertyFilter(stringProp);
    expect(p.in(["A", "B"])).toEqual({
      kind: "in",
      column: "Title",
      values: ["A", "B"],
      negate: false,
    });
    expect(p.notIn(["A", "B"])).toEqual({
      kind: "in",
      column: "Title",
      values: ["A", "B"],
      negate: true,
    });
  });
});

describe("PropertyFilter number ops", () => {
  it("gt/ge/lt/le", () => {
    const p = new PropertyFilter(numberProp);
    expect(p.gt(5)).toEqual({
      kind: "compare",
      column: "ViewCount",
      op: "gt",
      value: 5,
    });
    expect(p.ge(5)).toEqual({
      kind: "compare",
      column: "ViewCount",
      op: "ge",
      value: 5,
    });
    expect(p.lt(5)).toEqual({
      kind: "compare",
      column: "ViewCount",
      op: "lt",
      value: 5,
    });
    expect(p.le(5)).toEqual({
      kind: "compare",
      column: "ViewCount",
      op: "le",
      value: 5,
    });
  });
  it("between desugars to ge + le", () => {
    const p = new PropertyFilter(numberProp);
    expect(p.between(1, 10)).toEqual({
      kind: "and",
      children: [
        { kind: "compare", column: "ViewCount", op: "ge", value: 1 },
        { kind: "compare", column: "ViewCount", op: "le", value: 10 },
      ],
    });
  });
});

describe("PropertyFilter boolean ops", () => {
  it("isTrue / isFalse", () => {
    const p = new PropertyFilter(boolProp);
    expect(p.isTrue()).toEqual({
      kind: "compare",
      column: "IsPublished",
      op: "eq",
      value: true,
    });
    expect(p.isFalse()).toEqual({
      kind: "compare",
      column: "IsPublished",
      op: "eq",
      value: false,
    });
  });
});

describe("PropertyFilter date ops", () => {
  it("gt with Date value", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    const p = new PropertyFilter(dateProp);
    expect(p.gt(d)).toEqual({
      kind: "compare",
      column: "PublishedAt",
      op: "gt",
      value: d,
    });
  });
  it("between", () => {
    const a = new Date("2026-01-01T00:00:00Z");
    const b = new Date("2026-12-31T00:00:00Z");
    const p = new PropertyFilter(dateProp);
    expect(p.between(a, b)).toEqual({
      kind: "and",
      children: [
        { kind: "compare", column: "PublishedAt", op: "ge", value: a },
        { kind: "compare", column: "PublishedAt", op: "le", value: b },
      ],
    });
  });
});

describe("PropertyFilter multichoice ops", () => {
  it("contains / containsAny / containsAll", () => {
    const p = new PropertyFilter(multiProp);
    expect(p.contains("x")).toEqual({
      kind: "multichoice",
      column: "Tags",
      op: "contains",
      values: ["x"],
      negate: false,
    });
    expect(p.containsAny(["x", "y"])).toEqual({
      kind: "multichoice",
      column: "Tags",
      op: "containsAny",
      values: ["x", "y"],
      negate: false,
    });
    expect(p.containsAll(["x", "y"])).toEqual({
      kind: "multichoice",
      column: "Tags",
      op: "containsAll",
      values: ["x", "y"],
      negate: false,
    });
  });
  it("isEmpty / isNotEmpty", () => {
    const p = new PropertyFilter(multiProp);
    expect(p.isEmpty()).toEqual({
      kind: "multichoice",
      column: "Tags",
      op: "isEmpty",
      negate: false,
    });
    expect(p.isNotEmpty()).toEqual({
      kind: "multichoice",
      column: "Tags",
      op: "isEmpty",
      negate: true,
    });
  });
});
