import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import type { GroupLevel, GroupNode } from "../src/table/grouping.js";
import {
  useGroupCollapse,
  anyVisibleExpanded,
} from "../src/table/useGroupCollapse.js";

type Row = { n: number };
/** This Testing Library predates `renderHook`: a component that publishes the hook's value. */
function renderHook<R>(hook: () => R): { result: { current: R } } {
  const result = {} as { current: R };
  function Probe(): null {
    result.current = hook();
    return null;
  }
  render(<Probe />);
  return { result };
}
const node = (
  id: string,
  children: GroupNode<Row>[] = [],
  level = 0,
): GroupNode<Row> => ({
  id,
  level,
  value: id,
  label: id,
  count: 1,
  rows: [],
  startIndex: 0,
  children,
});
const level = (collapsed?: GroupLevel<Row>["collapsed"]): GroupLevel<Row> => ({
  key: "k",
  value: () => 0,
  label: () => "",
  compare: () => 0,
  direction: "asc",
  ...(collapsed !== undefined ? { collapsed } : {}),
});

describe("useGroupCollapse", () => {
  it("starts expanded by default", () => {
    const { result } = renderHook(() => useGroupCollapse<Row>());
    expect(result.current.isCollapsed(node("a"), level())).toBe(false);
  });

  it("takes the level's collapsed default, static or computed", () => {
    const { result } = renderHook(() => useGroupCollapse<Row>());
    expect(result.current.isCollapsed(node("a"), level(true))).toBe(true);
    const seen: string[] = [];
    const fn = level((g) => {
      seen.push(g.id);
      return g.id === "b";
    });
    expect(result.current.isCollapsed(node("a"), fn)).toBe(false);
    expect(result.current.isCollapsed(node("b"), fn)).toBe(true);
    expect(seen).toEqual(["a", "b"]);
  });

  it("toggles one group from what it shows", () => {
    const { result } = renderHook(() => useGroupCollapse<Row>());
    act(() => result.current.toggle("a", false));
    expect(result.current.isCollapsed(node("a"), level())).toBe(true);
    expect(result.current.isCollapsed(node("b"), level())).toBe(false);
  });

  it("setAll beats level defaults and clears overrides; later toggles layer on top", () => {
    const { result } = renderHook(() => useGroupCollapse<Row>());
    act(() => result.current.toggle("a", true)); // a expanded by override
    act(() => result.current.setAll(true));
    expect(result.current.isCollapsed(node("a"), level(false))).toBe(true);
    expect(result.current.isCollapsed(node("new"), level(false))).toBe(true);
    act(() => result.current.toggle("a", true));
    expect(result.current.isCollapsed(node("a"), level(false))).toBe(false);
    act(() => result.current.setAll(false));
    expect(result.current.isCollapsed(node("b"), level(true))).toBe(false);
  });
});

describe("anyVisibleExpanded", () => {
  const tree = [
    node("a", [node("a/x", [], 1)]),
    node("b", [node("b/y", [], 1)]),
  ];

  it("is false when every root is collapsed, even with expanded children", () => {
    const collapsed = new Set(["a", "b"]);
    expect(anyVisibleExpanded(tree, (g) => collapsed.has(g.id))).toBe(false);
  });

  it("is true when a visible group is expanded", () => {
    const collapsed = new Set(["a", "a/x", "b/y"]);
    expect(anyVisibleExpanded(tree, (g) => collapsed.has(g.id))).toBe(true);
  });
});
