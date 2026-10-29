import { useCallback, useState } from "react";
import type { GroupLevel, GroupNode } from "./grouping.js";

/** Session-only collapse state for a grouped table, keyed by group id. */
export interface GroupCollapse<T> {
  /** The id's override, else the all-mode, else the level's `collapsed` default (absent =
   *  expanded). */
  isCollapsed: (g: GroupNode<T>, level: GroupLevel<T>) => boolean;
  /** Flip one group from the state it currently shows. */
  toggle: (id: string, currentlyCollapsed: boolean) => void;
  /** Clears every override and sets the all-mode. */
  setAll: (collapsed: boolean) => void;
}

interface CollapseState {
  /** The last expand/collapse-all, which replaces every level's default from then on. */
  mode?: boolean;
  /** Per-group choices. They outlive the group: an id filtered away and back keeps its state. */
  overrides: Record<string, boolean>;
}

export function useGroupCollapse<T>(): GroupCollapse<T> {
  const [state, setState] = useState<CollapseState>({ overrides: {} });
  const isCollapsed = (g: GroupNode<T>, level: GroupLevel<T>): boolean => {
    const own = state.overrides[g.id];
    if (own !== undefined) return own;
    if (state.mode !== undefined) return state.mode;
    const d = level.collapsed;
    return typeof d === "function" ? d(g) : (d ?? false);
  };
  const toggle = useCallback(
    (id: string, currentlyCollapsed: boolean): void =>
      setState((s) => ({
        ...s,
        overrides: { ...s.overrides, [id]: !currentlyCollapsed },
      })),
    [],
  );
  const setAll = useCallback(
    (collapsed: boolean): void => setState({ mode: collapsed, overrides: {} }),
    [],
  );
  return { isCollapsed, toggle, setAll };
}

/** Is any group on screen — every ancestor expanded — itself expanded? Decides whether the
 *  toolbar offers "Collapse all" or "Expand all". Roots are always on screen and an expanded
 *  root already answers yes, so only the roots need asking. */
export function anyVisibleExpanded<T>(
  roots: readonly GroupNode<T>[],
  collapsed: (g: GroupNode<T>) => boolean,
): boolean {
  return roots.some((g) => !collapsed(g));
}
