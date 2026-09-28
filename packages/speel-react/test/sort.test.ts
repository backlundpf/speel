import { describe, it, expect } from "vitest";
import type { FieldConfig } from "@speel/core";
import { comparatorFor, applySort } from "../src/table/sort.js";

const text = { kind: "Text", multiline: false } as unknown as FieldConfig;
const num = { kind: "Number" } as unknown as FieldConfig;
const dt = {
  kind: "DateTime",
  displayFormat: "DateOnly",
  friendlyFormat: "Disabled",
} as unknown as FieldConfig;
const choice = {
  kind: "Choice",
  multi: false,
  options: ["Low", "Med", "High"],
  fillIn: false,
  radioButtons: false,
} as unknown as FieldConfig;
const openChoice = {
  kind: "Choice",
  multi: false,
  fillIn: false,
  radioButtons: false,
  options: () => [],
} as unknown as FieldConfig;

describe("comparatorFor", () => {
  it("text → localeCompare", () => {
    expect(comparatorFor(text)("a", "b")).toBeLessThan(0);
  });
  it("number → numeric", () => {
    expect(comparatorFor(num)(2, 10)).toBeLessThan(0);
  });
  it("datetime → chronological", () => {
    expect(
      comparatorFor(dt)(new Date("2020-01-01"), new Date("2021-01-01")),
    ).toBeLessThan(0);
  });
  it("choice → declared order", () => {
    expect(comparatorFor(choice)("High", "Low")).toBeGreaterThan(0);
  });
  it("orders a thunk-sourced Choice by display text", () => {
    expect(comparatorFor(openChoice)("Beta", "Alpha")).toBeGreaterThan(0);
  });
  it("no config → natural numeric/string", () => {
    expect(comparatorFor(undefined)(2, 10)).toBeLessThan(0);
    expect(comparatorFor(undefined)("b", "a")).toBeGreaterThan(0);
  });
});

describe("applySort", () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
  const acc = (r: { n: number }) => r.n;
  it("asc / desc", () => {
    expect(
      applySort(rows, acc, comparatorFor(num), "asc").map((r) => r.n),
    ).toEqual([1, 2, 3]);
    expect(
      applySort(rows, acc, comparatorFor(num), "desc").map((r) => r.n),
    ).toEqual([3, 2, 1]);
  });
  it("empties always sort last, both directions", () => {
    const withGap = [{ n: 2 }, { n: undefined as unknown as number }, { n: 1 }];
    expect(
      applySort(withGap, acc, comparatorFor(num), "asc").map((r) => r.n),
    ).toEqual([1, 2, undefined]);
    expect(
      applySort(withGap, acc, comparatorFor(num), "desc").map((r) => r.n),
    ).toEqual([2, 1, undefined]);
  });
  it("is stable for equal keys", () => {
    const eq = [
      { n: 1, id: "a" },
      { n: 1, id: "b" },
    ];
    expect(
      applySort(eq, (r) => r.n, comparatorFor(num), "asc").map((r) => r.id),
    ).toEqual(["a", "b"]);
  });
});
