import { describe, it, expect } from "vitest";
import { resolveState, collectErrors } from "../../src/Forms/resolve.js";
import type { FieldContext } from "../../src/types.js";
import type { ValidationRule } from "../../src/Metadata/Validation.js";

const ctx = (
  value: unknown,
  values: Record<string, unknown> = {},
): FieldContext => ({ values, value, mode: "edit" });

describe("resolveState", () => {
  it("returns static booleans as-is", () => {
    expect(resolveState(true, ctx(undefined))).toBe(true);
    expect(resolveState(false, ctx(undefined))).toBe(false);
  });
  it("evaluates a predicate against the context", () => {
    expect(
      resolveState(
        (c: FieldContext) => (c.values as { Open?: boolean }).Open === true,
        ctx(undefined, { Open: true }),
      ),
    ).toBe(true);
  });
});

describe("collectErrors", () => {
  it("returns messages for failing rules only", () => {
    const rules: ValidationRule[] = [
      { validate: (c) => c.value !== "", message: "required" },
      { validate: () => true, message: "never" },
    ];
    expect(collectErrors(rules, ctx(""))).toEqual(["required"]);
  });
});
