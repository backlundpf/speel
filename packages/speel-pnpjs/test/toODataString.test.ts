import { describe, it, expect } from "vitest";
import { toODataString } from "../src/toODataString.js";
import type { FilterNode } from "@speel/core";
import { QueryTranslationException } from "@speel/core";

const cmp = (
  col: string,
  op: "eq" | "ne" | "gt" | "ge" | "lt" | "le",
  value: unknown,
): FilterNode => ({
  kind: "compare",
  column: col,
  op,
  value,
});

describe("toODataString", () => {
  it("compare with string value", () => {
    expect(toODataString(cmp("Title", "eq", "Hello"))).toBe("Title eq 'Hello'");
  });
  it("escapes single quotes by doubling them", () => {
    expect(toODataString(cmp("Title", "eq", "O'Brien"))).toBe(
      "Title eq 'O''Brien'",
    );
  });
  it("compare with number value (no quotes)", () => {
    expect(toODataString(cmp("Views", "gt", 5))).toBe("Views gt 5");
  });
  it("compare with boolean value emits 1/0, not true/false", () => {
    expect(toODataString(cmp("IsPublished", "eq", true))).toBe(
      "IsPublished eq 1",
    );
    expect(toODataString(cmp("IsPublished", "eq", false))).toBe(
      "IsPublished eq 0",
    );
  });
  it("ne with boolean value also emits 1/0", () => {
    expect(toODataString(cmp("IsPublished", "ne", true))).toBe(
      "IsPublished ne 1",
    );
    expect(toODataString(cmp("IsPublished", "ne", false))).toBe(
      "IsPublished ne 0",
    );
  });
  it("in over boolean values emits 1/0", () => {
    expect(
      toODataString({
        kind: "in",
        column: "IsPublished",
        values: [true, false],
        negate: false,
      }),
    ).toBe("(IsPublished eq 1 or IsPublished eq 0)");
  });
  it("compare with Date value (ISO 8601)", () => {
    const d = new Date("2026-01-02T03:04:05Z");
    expect(toODataString(cmp("PublishedAt", "ge", d))).toBe(
      `PublishedAt ge datetime'2026-01-02T03:04:05.000Z'`,
    );
  });

  it("is-null and is-not-null", () => {
    expect(
      toODataString({ kind: "is-null", column: "Title", negate: false }),
    ).toBe("Title eq null");
    expect(
      toODataString({ kind: "is-null", column: "Title", negate: true }),
    ).toBe("Title ne null");
  });

  it("in expands to OR chain", () => {
    expect(
      toODataString({
        kind: "in",
        column: "Status",
        values: ["A", "B", "C"],
        negate: false,
      }),
    ).toBe("(Status eq 'A' or Status eq 'B' or Status eq 'C')");
  });

  it("notIn wraps in NOT", () => {
    expect(
      toODataString({
        kind: "in",
        column: "Status",
        values: ["A", "B"],
        negate: true,
      }),
    ).toBe("not (Status eq 'A' or Status eq 'B')");
  });

  it("startsWith / endsWith / contains", () => {
    expect(
      toODataString({
        kind: "string",
        column: "T",
        op: "startsWith",
        value: "H",
      }),
    ).toBe("startswith(T, 'H')");
    expect(
      toODataString({
        kind: "string",
        column: "T",
        op: "endsWith",
        value: "o",
      }),
    ).toBe("endswith(T, 'o')");
    expect(
      toODataString({
        kind: "string",
        column: "T",
        op: "contains",
        value: "ell",
      }),
    ).toBe("substringof('ell', T)");
  });

  it("and / or / not", () => {
    expect(
      toODataString({
        kind: "and",
        children: [cmp("A", "eq", 1), cmp("B", "eq", 2)],
      }),
    ).toBe("(A eq 1) and (B eq 2)");

    expect(
      toODataString({
        kind: "or",
        children: [cmp("A", "eq", 1), cmp("B", "eq", 2)],
      }),
    ).toBe("(A eq 1) or (B eq 2)");

    expect(toODataString({ kind: "not", child: cmp("A", "eq", 1) })).toBe(
      "not (A eq 1)",
    );
  });

  it("multichoice contains", () => {
    expect(
      toODataString({
        kind: "multichoice",
        column: "Tags",
        op: "contains",
        values: ["x"],
        negate: false,
      }),
    ).toBe("Tags eq 'x'");
  });

  it("multichoice containsAny → OR chain", () => {
    expect(
      toODataString({
        kind: "multichoice",
        column: "Tags",
        op: "containsAny",
        values: ["x", "y"],
        negate: false,
      }),
    ).toBe("(Tags eq 'x' or Tags eq 'y')");
  });

  it("multichoice isEmpty", () => {
    expect(
      toODataString({
        kind: "multichoice",
        column: "Tags",
        op: "isEmpty",
        negate: false,
      }),
    ).toBe("Tags eq null");
  });

  it("throws on multichoice containsAll (documented limitation)", () => {
    expect(() =>
      toODataString({
        kind: "multichoice",
        column: "Tags",
        op: "containsAll",
        values: ["x", "y"],
        negate: false,
      }),
    ).toThrow(QueryTranslationException);
  });
});
