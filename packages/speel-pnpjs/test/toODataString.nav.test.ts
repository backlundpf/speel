import { describe, it, expect } from "vitest";
import { toODataString } from "../src/toODataString.js";
import type { FilterNode } from "@speel/core";

describe("toODataString — nav slash-paths", () => {
  it("compare with slash-path column", () => {
    const n: FilterNode = {
      kind: "compare",
      column: "Author/Title",
      op: "eq",
      value: "Jane",
    };
    expect(toODataString(n)).toBe(`Author/Title eq 'Jane'`);
  });
  it("startsWith with slash-path", () => {
    const n: FilterNode = {
      kind: "string",
      column: "Author/Title",
      op: "startsWith",
      value: "Ja",
    };
    expect(toODataString(n)).toBe(`startswith(Author/Title, 'Ja')`);
  });
  it("is-null with slash-path", () => {
    const n: FilterNode = {
      kind: "is-null",
      column: "Author/Email",
      negate: true,
    };
    expect(toODataString(n)).toBe(`Author/Email ne null`);
  });
});
