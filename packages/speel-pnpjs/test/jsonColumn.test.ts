import { describe, it, expect } from "vitest";
import { coerceValue } from "../src/readValues.js";
import type { FieldConfig } from "@speel/core";

// A Json column is a Text column as far as the wire is concerned: core hands the
// provider a string and gets one back. Everything about the JSON inside it is core's.
const json = {
  kind: "Json",
  multi: true,
  shape: {} as never,
} as unknown as FieldConfig;

describe("a Json column on the wire", () => {
  it("reads as the string it is", () => {
    expect(coerceValue(json, '[{"Title":"a"}]', "Tasks")).toBe(
      '[{"Title":"a"}]',
    );
  });

  it("passes null through", () => {
    expect(coerceValue(json, null, "Tasks")).toBeNull();
  });
});
