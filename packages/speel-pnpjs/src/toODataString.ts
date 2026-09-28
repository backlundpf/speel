// src/toODataString.ts
import type { FilterNode } from "@speel/core";
import { QueryTranslationException } from "@speel/core";

export interface IODataContext {
  /** Server-relative base (the list root) for container-scope nodes. */
  containerBaseUrl?: string;
}

export function toODataString(node: FilterNode, ctx?: IODataContext): string {
  switch (node.kind) {
    case "compare":
      return `${node.column} ${node.op} ${literal(node.value)}`;
    case "is-null":
      return `${node.column} ${node.negate ? "ne" : "eq"} null`;
    case "in": {
      const inner = node.values
        .map((v) => `${node.column} eq ${literal(v)}`)
        .join(" or ");
      const wrapped = `(${inner})`;
      return node.negate ? `not ${wrapped}` : wrapped;
    }
    case "string":
      switch (node.op) {
        case "startsWith":
          return `startswith(${node.column}, ${literalString(node.value)})`;
        case "endsWith":
          return `endswith(${node.column}, ${literalString(node.value)})`;
        case "contains":
          return `substringof(${literalString(node.value)}, ${node.column})`;
        default:
          return ""; // unreachable
      }
    case "multichoice": {
      switch (node.op) {
        case "contains": {
          const v = node.values![0];
          const expr = `${node.column} eq ${literalString(v!)}`;
          return node.negate ? `not (${expr})` : expr;
        }
        case "containsAny": {
          const inner = (node.values ?? [])
            .map((v) => `${node.column} eq ${literalString(v)}`)
            .join(" or ");
          const wrapped = `(${inner})`;
          return node.negate ? `not ${wrapped}` : wrapped;
        }
        case "containsAll":
          throw new QueryTranslationException(
            `containsAll on MultiChoice column '${node.column}' is not natively expressible in OData; ` +
              `use chained where(b => b.${node.column}.contains(...)) calls instead.`,
            node,
          );
        case "isEmpty": {
          const expr = `${node.column} eq null`;
          return node.negate ? `not (${expr})` : expr;
        }
        default:
          return ""; // unreachable
      }
    }
    case "container-scope": {
      const base = ctx?.containerBaseUrl;
      if (!base) {
        throw new QueryTranslationException(
          `container-scope requires a containerBaseUrl in the translation context; ` +
            `the provider must resolve the list root before translating.`,
          node,
        );
      }
      const url = `${base}/${node.path}`;
      const exact = `FileDirRef eq ${literalString(url)}`;
      return node.recursive
        ? `(${exact} or startswith(FileDirRef, ${literalString(`${url}/`)}))`
        : exact;
    }
    case "include-containers":
      throw new QueryTranslationException(
        `include-containers must be hoisted to IGetItemsOptions.includeContainers by the ` +
          `query executor; it must not reach the OData translator.`,
        node,
      );
    case "and": {
      if (node.children.length === 0) return "";
      return node.children
        .map((c) => `(${toODataString(c, ctx)})`)
        .join(" and ");
    }
    case "or": {
      if (node.children.length === 0) return "1 eq 0";
      return node.children
        .map((c) => `(${toODataString(c, ctx)})`)
        .join(" or ");
    }
    case "not":
      return `not (${toODataString(node.child, ctx)})`;
  }
}

function literal(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  // SharePoint's list-item $filter parser expects 1/0 for Yes/No columns, not the
  // OData `true`/`false` keywords — `Flag eq true` is rejected as an invalid expression.
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return `datetime'${value.toISOString()}'`;
  return literalString(String(value));
}

function literalString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}
