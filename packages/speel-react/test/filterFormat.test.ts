import { describe, it, expect } from "vitest";
import type { FieldConfig } from "@speel/core";
import { formatCriteria } from "../src/table/filter/format.js";

const choice = {
  kind: "Choice",
  choices: ["Open", "Closed"],
  fillIn: false,
  displayAs: "Dropdown",
} as unknown as FieldConfig;

describe("formatCriteria", () => {
  it("text → query", () => {
    expect(formatCriteria(undefined, { kind: "text", query: "wid" })).toBe(
      "wid",
    );
  });
  it("numberRange → min–max / ≥ / ≤", () => {
    expect(
      formatCriteria(undefined, { kind: "numberRange", min: 5, max: 10 }),
    ).toBe("5–10");
    expect(formatCriteria(undefined, { kind: "numberRange", min: 5 })).toBe(
      "≥ 5",
    );
    expect(formatCriteria(undefined, { kind: "numberRange", max: 10 })).toBe(
      "≤ 10",
    );
  });
  it("select → joined option labels", () => {
    expect(
      formatCriteria(choice, { kind: "select", selected: ["Open", "Closed"] }),
    ).toBe("Open, Closed");
  });
  it("boolean → Yes/No", () => {
    expect(formatCriteria(undefined, { kind: "boolean", value: true })).toBe(
      "Yes",
    );
  });
  it("dateRange with a preset → preset label", () => {
    expect(
      formatCriteria(undefined, {
        kind: "dateRange",
        from: new Date(2026, 3, 1),
        to: new Date(2026, 5, 30),
        preset: "thisFiscalQuarter",
      }),
    ).toBe("This fiscal quarter");
  });
});
