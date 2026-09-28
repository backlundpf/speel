// src/Query/FilterNode.ts
export type ComparisonOp = "eq" | "ne" | "gt" | "ge" | "lt" | "le";

export type FilterNode =
  | { kind: "compare"; column: string; op: ComparisonOp; value: unknown }
  | { kind: "in"; column: string; values: readonly unknown[]; negate: boolean }
  | { kind: "is-null"; column: string; negate: boolean }
  | {
      kind: "string";
      column: string;
      op: "startsWith" | "endsWith" | "contains";
      value: string;
    }
  | {
      kind: "multichoice";
      column: string;
      op: "contains" | "containsAny" | "containsAll" | "isEmpty";
      values?: readonly string[];
      negate: boolean;
    }
  /** Generic hierarchical containment: the item's container is `path` (or a descendant when recursive). */
  | { kind: "container-scope"; path: string; recursive: boolean }
  /**
   * Query-level annotation, not boolean logic: include container rows (e.g.
   * SharePoint folders) in results. Position-independent — the executor strips
   * it from the tree and hoists it to IGetItemsOptions.includeContainers;
   * providers never see it.
   */
  | { kind: "include-containers" }
  | { kind: "and" | "or"; children: readonly FilterNode[] }
  | { kind: "not"; child: FilterNode };

export function and(...nodes: FilterNode[]): FilterNode {
  if (nodes.length === 1) return nodes[0]!;
  return { kind: "and", children: nodes };
}

export function or(...nodes: FilterNode[]): FilterNode {
  if (nodes.length === 1) return nodes[0]!;
  return { kind: "or", children: nodes };
}

export function not(node: FilterNode): FilterNode {
  if (node.kind === "not") return node.child;
  return { kind: "not", child: node };
}
