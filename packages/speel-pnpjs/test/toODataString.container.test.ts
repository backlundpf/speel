// test/toODataString.container.test.ts
import { describe, it, expect } from "vitest";
import { toODataString } from "../src/toODataString.js";
import { and, type FilterNode } from "@speel/core";

const ctx = { containerBaseUrl: "/sites/dev/Docs" };

describe("toODataString container-scope", () => {
  it("renders an exact scope as a FileDirRef equality", () => {
    const node: FilterNode = {
      kind: "container-scope",
      path: "a/b",
      recursive: false,
    };
    expect(toODataString(node, ctx)).toBe(
      "FileDirRef eq '/sites/dev/Docs/a/b'",
    );
  });

  it("renders a recursive scope with the trailing-slash startswith guard", () => {
    const node: FilterNode = {
      kind: "container-scope",
      path: "reports",
      recursive: true,
    };
    expect(toODataString(node, ctx)).toBe(
      "(FileDirRef eq '/sites/dev/Docs/reports' or startswith(FileDirRef, '/sites/dev/Docs/reports/'))",
    );
  });

  it("escapes single quotes in the path", () => {
    const node: FilterNode = {
      kind: "container-scope",
      path: "o'brien",
      recursive: false,
    };
    expect(toODataString(node, ctx)).toBe(
      "FileDirRef eq '/sites/dev/Docs/o''brien'",
    );
  });

  it("threads the context through composites", () => {
    const node = and(
      { kind: "compare", column: "Title", op: "eq", value: "A" } as FilterNode,
      { kind: "container-scope", path: "a", recursive: false } as FilterNode,
    );
    expect(toODataString(node, ctx)).toBe(
      "(Title eq 'A') and (FileDirRef eq '/sites/dev/Docs/a')",
    );
  });

  it("throws loudly on a scope node without a containerBaseUrl", () => {
    const node: FilterNode = {
      kind: "container-scope",
      path: "a",
      recursive: false,
    };
    expect(() => toODataString(node)).toThrow(/containerBaseUrl/);
  });

  it("throws loudly on a leaked include-containers marker", () => {
    const node: FilterNode = { kind: "include-containers" };
    expect(() => toODataString(node)).toThrow(/include-containers/);
  });
});
