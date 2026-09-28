// test/unit/Query/FilterNode.test.ts
import { describe, it, expect } from "vitest";
import {
  and,
  or,
  not,
  type FilterNode,
} from "../../../src/Query/FilterNode.js";

const cmp = (column: string, op: "eq", value: unknown): FilterNode => ({
  kind: "compare",
  column,
  op,
  value,
});

describe("FilterNode combinators", () => {
  it("and with multiple children wraps in an and node", () => {
    const a = cmp("A", "eq", 1);
    const b = cmp("B", "eq", 2);
    expect(and(a, b)).toEqual({ kind: "and", children: [a, b] });
  });

  it("and with a single child passes through unchanged", () => {
    const a = cmp("A", "eq", 1);
    expect(and(a)).toBe(a);
  });

  it("and with no children produces empty-and (always true)", () => {
    expect(and()).toEqual({ kind: "and", children: [] });
  });

  it("or with multiple children wraps in an or node", () => {
    const a = cmp("A", "eq", 1);
    const b = cmp("B", "eq", 2);
    expect(or(a, b)).toEqual({ kind: "or", children: [a, b] });
  });

  it("or with a single child passes through unchanged", () => {
    const a = cmp("A", "eq", 1);
    expect(or(a)).toBe(a);
  });

  it("or with no children produces empty-or (always false)", () => {
    expect(or()).toEqual({ kind: "or", children: [] });
  });

  it("not wraps in a not node", () => {
    const a = cmp("A", "eq", 1);
    expect(not(a)).toEqual({ kind: "not", child: a });
  });

  it("not(not(x)) eliminates the double negation", () => {
    const a = cmp("A", "eq", 1);
    expect(not(not(a))).toBe(a);
  });
});
