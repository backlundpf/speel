import { describe, it, expect } from "vitest";
import {
  isEmpty,
  requiredRule,
  minLengthRule,
  maxLengthRule,
  minRule,
  maxRule,
  dateMinRule,
  dateMaxRule,
  choiceMembershipRule,
} from "../../src/Metadata/Validation.js";
import type { FieldContext } from "../../src/types.js";

const ctx = (
  value: unknown,
  values: Record<string, unknown> = {},
): FieldContext => ({ values, value, mode: "edit" });

describe("rule factories read ctx.value", () => {
  it("requiredRule: static true fails on empty, passes on present", () => {
    const r = requiredRule(true, "Title");
    expect(r.validate(ctx(""))).toBe(false);
    expect(r.validate(ctx("hi"))).toBe(true);
  });
  it("requiredRule: predicate reads ctx.values", () => {
    const r = requiredRule(
      (c: FieldContext) => (c.values as { Owner?: unknown }).Owner != null,
      "Budget",
    );
    expect(r.validate(ctx("", { Owner: null }))).toBe(true); // not required → empty ok
    expect(r.validate(ctx("", { Owner: 1 }))).toBe(false); // required → empty fails
  });
  it("minLength/maxLength", () => {
    expect(minLengthRule(3, "T").validate(ctx("ab"))).toBe(false);
    expect(minLengthRule(3, "T").validate(ctx("abc"))).toBe(true);
    expect(maxLengthRule(2, "T").validate(ctx("abc"))).toBe(false);
    expect(minLengthRule(3, "T").validate(ctx(""))).toBe(true); // empty passes refinement
  });
  it("min/max", () => {
    expect(minRule(5, "N").validate(ctx(4))).toBe(false);
    expect(maxRule(5, "N").validate(ctx(6))).toBe(false);
  });
  it("date min/max", () => {
    expect(dateMinRule("2026-01-01", "D").validate(ctx("2025-12-31"))).toBe(
      false,
    );
    expect(dateMaxRule("2026-01-01", "D").validate(ctx("2026-02-01"))).toBe(
      false,
    );
  });
  it("choiceMembership uses keyOf", () => {
    const r = choiceMembershipRule(["a", "b"], (x) => x, false, "C");
    expect(r.validate(ctx("a"))).toBe(true);
    expect(r.validate(ctx("z"))).toBe(false);
  });
  it("isEmpty unchanged", () => {
    expect(isEmpty("")).toBe(true);
    expect(isEmpty(0)).toBe(false);
  });
});
