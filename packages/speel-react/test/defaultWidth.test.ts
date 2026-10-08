import { describe, it, expect } from "vitest";
import type { FieldConfig } from "@speel/core";
import {
  CUSTOM_COLUMN_WIDTH,
  defaultFlexFor,
  defaultWidthFor,
} from "../src/table/defaultWidth.js";

/** Only the members the width reads; the rest of each config is irrelevant here. */
const cfg = (c: object): FieldConfig => c as FieldConfig;

describe("defaultWidthFor", () => {
  it.each([
    ["Boolean", cfg({ kind: "Boolean" }), 70],
    ["Number", cfg({ kind: "Number" }), 90],
    ["Currency", cfg({ kind: "Currency", decimalPlaces: 2 }), 90],
    ["DateOnly", cfg({ kind: "DateTime", displayFormat: "DateOnly" }), 100],
    ["DateTime", cfg({ kind: "DateTime", displayFormat: "DateTime" }), 150],
    ["Choice", cfg({ kind: "Choice", multi: false }), 120],
    ["multi Choice", cfg({ kind: "Choice", multi: true }), 180],
    ["Text", cfg({ kind: "Text", multiline: false }), 180],
    ["Note", cfg({ kind: "Text", multiline: true }), 260],
    ["Lookup", cfg({ kind: "Lookup", multi: false }), 180],
    ["multi Lookup", cfg({ kind: "Lookup", multi: true }), 220],
    ["Json", cfg({ kind: "Json", multi: false }), 180],
  ])("%s → %i", (_name, config, width) => {
    expect(defaultWidthFor(config)).toBe(width);
  });

  it("gives a column with no field the custom default", () => {
    expect(defaultWidthFor(undefined)).toBe(CUSTOM_COLUMN_WIDTH);
    expect(CUSTOM_COLUMN_WIDTH).toBe(100);
  });
});

describe("defaultFlexFor", () => {
  it.each([
    ["Text", cfg({ kind: "Text", multiline: false }), { grow: 1, shrink: 1 }],
    ["Note", cfg({ kind: "Text", multiline: true }), { grow: 2, shrink: 1 }],
    ["Json", cfg({ kind: "Json", multi: false }), { grow: 2, shrink: 1 }],
    ["Lookup", cfg({ kind: "Lookup", multi: true }), { grow: 1, shrink: 1 }],
    ["Choice", cfg({ kind: "Choice", multi: false }), { grow: 1, shrink: 1 }],
    ["Boolean", cfg({ kind: "Boolean" }), { grow: 0, shrink: 0 }],
    ["Number", cfg({ kind: "Number" }), { grow: 0, shrink: 0 }],
    [
      "Currency",
      cfg({ kind: "Currency", decimalPlaces: 2 }),
      { grow: 0, shrink: 0 },
    ],
    [
      "DateTime",
      cfg({ kind: "DateTime", displayFormat: "DateOnly" }),
      { grow: 0, shrink: 0 },
    ],
  ])("%s", (_name, config, flex) => {
    expect(defaultFlexFor(config)).toEqual(flex);
  });

  it("keeps a column with no field fixed", () => {
    expect(defaultFlexFor(undefined)).toEqual({ grow: 0, shrink: 0 });
  });
});
