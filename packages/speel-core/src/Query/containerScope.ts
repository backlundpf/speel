// src/Query/containerScope.ts
import type { FilterNode } from "./FilterNode.js";

export interface IContainerOptions {
  /** The tree with include-containers markers removed (empty composites pruned). */
  filter: FilterNode | undefined;
  includeContainers: boolean;
}

/**
 * Hoist include-containers annotations out of a filter tree. The marker is
 * position-independent (not boolean logic): it is collected wherever it
 * appears and removed; and/or composites left with one child collapse to that
 * child, empty composites (and not-of-marker) disappear.
 */
export function extractContainerOptions(
  filter: FilterNode | undefined,
): IContainerOptions {
  if (!filter) return { filter: undefined, includeContainers: false };
  let found = false;
  const strip = (node: FilterNode): FilterNode | undefined => {
    switch (node.kind) {
      case "include-containers":
        found = true;
        return undefined;
      case "and":
      case "or": {
        const children = node.children
          .map(strip)
          .filter((c): c is FilterNode => c !== undefined);
        if (children.length === 0) return undefined;
        if (children.length === 1) return children[0];
        return { kind: node.kind, children };
      }
      case "not": {
        const child = strip(node.child);
        return child === undefined ? undefined : { kind: "not", child };
      }
      default:
        return node;
    }
  };
  const stripped = strip(filter);
  return { filter: stripped, includeContainers: found };
}

/** True when the tree contains a container-scope node (the provider must resolve a container base URL). */
export function containsContainerScope(
  filter: FilterNode | undefined,
): boolean {
  if (!filter) return false;
  switch (filter.kind) {
    case "container-scope":
      return true;
    case "and":
    case "or":
      return filter.children.some(containsContainerScope);
    case "not":
      return containsContainerScope(filter.child);
    default:
      return false;
  }
}
