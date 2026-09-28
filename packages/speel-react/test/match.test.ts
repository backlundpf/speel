import { describe, it, expect } from "vitest";
import type { FieldConfig } from "@speel/core";
import {
  matches,
  isActiveCriteria,
  type FilterCriteria,
} from "../src/table/filter/match.js";

const text = { kind: "Text", multiline: false } as unknown as FieldConfig;
const num = { kind: "Number" } as unknown as FieldConfig;
const multi = {
  kind: "Choice",
  multi: true,
  choices: ["A", "B", "C"],
  fillIn: false,
  displayAs: "Dropdown",
} as unknown as FieldConfig;

describe("isActiveCriteria", () => {
  it("text active only when non-blank", () => {
    expect(isActiveCriteria({ kind: "text", query: "" })).toBe(false);
    expect(isActiveCriteria({ kind: "text", query: "x" })).toBe(true);
  });
  it("range active when a bound is set", () => {
    expect(isActiveCriteria({ kind: "numberRange" })).toBe(false);
    expect(isActiveCriteria({ kind: "numberRange", min: 1 })).toBe(true);
  });
  it("select active when something selected", () => {
    expect(isActiveCriteria({ kind: "select", selected: [] })).toBe(false);
  });
});

describe("matches", () => {
  it("inactive criteria always pass", () => {
    expect(matches(text, { kind: "text", query: "" }, "anything")).toBe(true);
  });
  it("text contains, case-insensitive", () => {
    expect(matches(text, { kind: "text", query: "wid" }, "Widget")).toBe(true);
    expect(matches(text, { kind: "text", query: "zzz" }, "Widget")).toBe(false);
  });
  it("numberRange open bounds + empties excluded", () => {
    expect(matches(num, { kind: "numberRange", min: 5 }, 10)).toBe(true);
    expect(matches(num, { kind: "numberRange", max: 5 }, 10)).toBe(false);
    expect(matches(num, { kind: "numberRange", min: 5 }, undefined)).toBe(
      false,
    );
  });
  it("dateRange inclusive", () => {
    const c: FilterCriteria = {
      kind: "dateRange",
      from: new Date("2026-01-01"),
      to: new Date("2026-12-31"),
    };
    expect(matches(undefined, c, new Date("2026-06-01"))).toBe(true);
    expect(matches(undefined, c, new Date("2027-01-01"))).toBe(false);
  });
  it("select matches MultiChoice by intersection", () => {
    expect(
      matches(multi, { kind: "select", selected: ["B"] }, ["A", "B"]),
    ).toBe(true);
    expect(
      matches(multi, { kind: "select", selected: ["C"] }, ["A", "B"]),
    ).toBe(false);
  });
  it("boolean exact", () => {
    expect(matches(undefined, { kind: "boolean", value: true }, true)).toBe(
      true,
    );
    expect(matches(undefined, { kind: "boolean", value: false }, true)).toBe(
      false,
    );
  });
  it('dateRange "to" is inclusive through end-of-day (time-bearing values)', () => {
    const c: FilterCriteria = { kind: "dateRange", to: new Date(2026, 5, 15) }; // midnight Jun 15
    expect(matches(undefined, c, new Date(2026, 5, 15, 15, 0))).toBe(true); // 3pm same day → included
    expect(matches(undefined, c, new Date(2026, 5, 16, 0, 0))).toBe(false); // next day → excluded
  });
});
