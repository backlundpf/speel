import { describe, it, expect } from "vitest";
import {
  extractContainerOptions,
  containsContainerScope,
} from "../../../src/Query/containerScope.js";
import {
  and,
  or,
  not,
  type FilterNode,
} from "../../../src/Query/FilterNode.js";

const cmp: FilterNode = {
  kind: "compare",
  column: "Title",
  op: "eq",
  value: "A",
};
const marker: FilterNode = { kind: "include-containers" };
const scope: FilterNode = {
  kind: "container-scope",
  path: "a/b",
  recursive: false,
};

describe("extractContainerOptions", () => {
  it("passes undefined through", () => {
    expect(extractContainerOptions(undefined)).toEqual({
      filter: undefined,
      includeContainers: false,
    });
  });
  it("leaves a marker-free tree untouched", () => {
    expect(extractContainerOptions(and(cmp, scope))).toEqual({
      filter: and(cmp, scope),
      includeContainers: false,
    });
  });
  it("strips a root-level marker to an empty filter", () => {
    expect(extractContainerOptions(marker)).toEqual({
      filter: undefined,
      includeContainers: true,
    });
  });
  it("strips a marker out of an and, collapsing the single survivor", () => {
    expect(extractContainerOptions(and(marker, cmp))).toEqual({
      filter: cmp,
      includeContainers: true,
    });
  });
  it("prunes composites left empty and unwraps not-of-marker", () => {
    expect(extractContainerOptions(or(marker, marker))).toEqual({
      filter: undefined,
      includeContainers: true,
    });
    expect(extractContainerOptions(not(marker))).toEqual({
      filter: undefined,
      includeContainers: true,
    });
  });
  it("finds markers nested under not/or and keeps the rest of the tree", () => {
    const tree = and(cmp, or(marker, scope));
    expect(extractContainerOptions(tree)).toEqual({
      filter: and(cmp, scope),
      includeContainers: true,
    });
  });
});

describe("containsContainerScope", () => {
  it("detects a scope node at any depth", () => {
    expect(containsContainerScope(scope)).toBe(true);
    expect(containsContainerScope(and(cmp, not(scope)))).toBe(true);
  });
  it("is false for undefined and scope-free trees", () => {
    expect(containsContainerScope(undefined)).toBe(false);
    expect(containsContainerScope(and(cmp, marker))).toBe(false);
  });
});
