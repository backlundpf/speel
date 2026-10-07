import { describe, it, expect } from "vitest";
import type { FieldConfig } from "@speel/core";
import {
  CUSTOM_COLUMN_WIDTH,
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
