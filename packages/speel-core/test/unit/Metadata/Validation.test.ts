import { describe, it, expect } from "vitest";
import {
  isEmpty,
  minLengthRule,
  maxLengthRule,
  minRule,
  maxRule,
  dateMinRule,
  dateMaxRule,
  choiceMembershipRule,
  type ValidationRule,
} from "../../../src/Metadata/Validation.js";

describe("isEmpty", () => {
  it("treats null, undefined, empty string, and empty array as empty", () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty("")).toBe(true);
    expect(isEmpty([])).toBe(true);
  });

  it("treats 0, false, and non-empty values as NOT empty", () => {
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(false)).toBe(false);
    expect(isEmpty("x")).toBe(false);
    expect(isEmpty([1])).toBe(false);
  });
});

describe("refinement rule factories", () => {
  const ok = (r: ValidationRule, v: unknown) =>
    r.validate({ values: {}, value: v, mode: "edit" });

  it("minLengthRule: fails when too short, passes when long enough or empty", () => {
    const r = minLengthRule(3, "Title");
    expect(ok(r, "ab")).toBe(false);
    expect(ok(r, "abc")).toBe(true);
    expect(ok(r, "")).toBe(true); // empty governed by isRequired
    expect(ok(r, null)).toBe(true);
    expect(r.message).toBe("Title must be at least 3 characters.");
  });

  it("maxLengthRule: fails when too long", () => {
    const r = maxLengthRule(2, "Code");
    expect(ok(r, "abc")).toBe(false);
    expect(ok(r, "ab")).toBe(true);
    expect(ok(r, null)).toBe(true);
    expect(r.message).toBe("Code must be at most 2 characters.");
  });

  it("minRule/maxRule: numeric bounds, 0 is a present value", () => {
    expect(ok(minRule(5, "N"), 4)).toBe(false);
    expect(ok(minRule(5, "N"), 5)).toBe(true);
    expect(ok(minRule(5, "N"), null)).toBe(true);
    expect(ok(maxRule(0, "N"), 1)).toBe(false);
    expect(ok(maxRule(0, "N"), 0)).toBe(true); // 0 is not empty
    expect(minRule(5, "N").message).toBe("N must be at least 5.");
    expect(maxRule(0, "N").message).toBe("N must be at most 0.");
  });

  it("dateMinRule/dateMaxRule: range with date-only message", () => {
    const min = dateMinRule("2026-01-01T00:00:00.000Z", "Due");
    expect(ok(min, new Date("2025-12-31T00:00:00Z"))).toBe(false);
    expect(ok(min, new Date("2026-02-01T00:00:00Z"))).toBe(true);
    expect(ok(min, null)).toBe(true);
    expect(min.message).toBe("Due must be on or after 2026-01-01.");
    const max = dateMaxRule("2026-12-31T00:00:00.000Z", "Due");
    expect(ok(max, new Date("2027-01-01T00:00:00Z"))).toBe(false);
    expect(max.message).toBe("Due must be on or before 2026-12-31.");
  });

  it("choiceMembershipRule: identity, object-key, and multi", () => {
    const strings = choiceMembershipRule(["a", "b"], (x) => x, false, "Status");
    expect(ok(strings, "a")).toBe(true);
    expect(ok(strings, "z")).toBe(false);
    expect(ok(strings, "")).toBe(true); // empty governed by isRequired
    expect(strings.message).toBe(
      "Status must be one of the available options.",
    );

    const opts = [{ id: "x" }, { id: "y" }];
    const objs = choiceMembershipRule(
      opts,
      (o) => (o as { id: string }).id,
      false,
      "Cat",
    );
    expect(ok(objs, { id: "x" })).toBe(true);
    expect(ok(objs, { id: "q" })).toBe(false);

    const multi = choiceMembershipRule(["a", "b", "c"], (x) => x, true, "Tags");
    expect(ok(multi, ["a", "c"])).toBe(true);
    expect(ok(multi, ["a", "z"])).toBe(false);
    expect(ok(multi, [])).toBe(true); // empty governed by isRequired
  });
});
