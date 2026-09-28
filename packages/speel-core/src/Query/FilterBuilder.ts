// src/Query/FilterBuilder.ts
import { Property } from "../Metadata/Property.js";
import type { FilterNode, ComparisonOp } from "./FilterNode.js";

/**
 * Runtime class backing the per-type method gating. The TypeScript
 * `PropertyFilterType<TValue>` type alias (see end of this file) intersects
 * conditional method-bag types based on TValue; at runtime, every method
 * is present on this single class.
 */
export class PropertyFilter {
  constructor(public readonly _property: Property) {}

  private get column(): string {
    return this._property.columnName;
  }

  // Universal
  eq(value: unknown): FilterNode {
    return { kind: "compare", column: this.column, op: "eq", value };
  }
  ne(value: unknown): FilterNode {
    return { kind: "compare", column: this.column, op: "ne", value };
  }
  isNull(): FilterNode {
    return { kind: "is-null", column: this.column, negate: false };
  }
  isNotNull(): FilterNode {
    return { kind: "is-null", column: this.column, negate: true };
  }

  // String
  startsWith(value: string): FilterNode {
    return { kind: "string", column: this.column, op: "startsWith", value };
  }
  endsWith(value: string): FilterNode {
    return { kind: "string", column: this.column, op: "endsWith", value };
  }
  contains(value: unknown): FilterNode {
    if (
      this._property.config.kind === "Choice" &&
      this._property.config.multi
    ) {
      return {
        kind: "multichoice",
        column: this.column,
        op: "contains",
        values: [value as string],
        negate: false,
      };
    }
    return {
      kind: "string",
      column: this.column,
      op: "contains",
      value: value as string,
    };
  }
  in(values: readonly unknown[]): FilterNode {
    return { kind: "in", column: this.column, values, negate: false };
  }
  notIn(values: readonly unknown[]): FilterNode {
    return { kind: "in", column: this.column, values, negate: true };
  }

  // Number / Date
  gt(value: unknown): FilterNode {
    return this.cmp("gt", value);
  }
  ge(value: unknown): FilterNode {
    return this.cmp("ge", value);
  }
  lt(value: unknown): FilterNode {
    return this.cmp("lt", value);
  }
  le(value: unknown): FilterNode {
    return this.cmp("le", value);
  }
  between(min: unknown, max: unknown): FilterNode {
    return {
      kind: "and",
      children: [this.cmp("ge", min), this.cmp("le", max)],
    };
  }

  // Boolean
  isTrue(): FilterNode {
    return this.cmp("eq", true);
  }
  isFalse(): FilterNode {
    return this.cmp("eq", false);
  }

  // MultiChoice
  containsAny(values: readonly string[]): FilterNode {
    return {
      kind: "multichoice",
      column: this.column,
      op: "containsAny",
      values,
      negate: false,
    };
  }
  containsAll(values: readonly string[]): FilterNode {
    return {
      kind: "multichoice",
      column: this.column,
      op: "containsAll",
      values,
      negate: false,
    };
  }
  isEmpty(): FilterNode {
    return {
      kind: "multichoice",
      column: this.column,
      op: "isEmpty",
      negate: false,
    };
  }
  isNotEmpty(): FilterNode {
    return {
      kind: "multichoice",
      column: this.column,
      op: "isEmpty",
      negate: true,
    };
  }

  private cmp(op: ComparisonOp, value: unknown): FilterNode {
    return { kind: "compare", column: this.column, op, value };
  }
}

// --- Public types for conditional method gating ---
// These are PURELY compile-time. At runtime PropertyFilter has all methods.

type PropertyFilterCommon<TValue> = {
  eq(value: NonNullable<TValue>): FilterNode;
  ne(value: NonNullable<TValue>): FilterNode;
  isNull(): FilterNode;
  isNotNull(): FilterNode;
};

type StringFilterMethods = {
  startsWith(value: string): FilterNode;
  endsWith(value: string): FilterNode;
  contains(value: string): FilterNode;
  in(values: readonly string[]): FilterNode;
  notIn(values: readonly string[]): FilterNode;
};

type NumberFilterMethods = {
  gt(value: number): FilterNode;
  ge(value: number): FilterNode;
  lt(value: number): FilterNode;
  le(value: number): FilterNode;
  between(min: number, max: number): FilterNode;
  in(values: readonly number[]): FilterNode;
  notIn(values: readonly number[]): FilterNode;
};

type BooleanFilterMethods = {
  isTrue(): FilterNode;
  isFalse(): FilterNode;
};

type DateFilterMethods = {
  gt(value: Date): FilterNode;
  ge(value: Date): FilterNode;
  lt(value: Date): FilterNode;
  le(value: Date): FilterNode;
  between(min: Date, max: Date): FilterNode;
};

type MultiChoiceFilterMethods = {
  contains(value: string): FilterNode;
  containsAny(values: readonly string[]): FilterNode;
  containsAll(values: readonly string[]): FilterNode;
  isEmpty(): FilterNode;
  isNotEmpty(): FilterNode;
};

export type PropertyFilterType<TValue> = PropertyFilterCommon<TValue> &
  (NonNullable<TValue> extends string ? StringFilterMethods : object) &
  (NonNullable<TValue> extends number ? NumberFilterMethods : object) &
  (NonNullable<TValue> extends boolean ? BooleanFilterMethods : object) &
  (NonNullable<TValue> extends Date ? DateFilterMethods : object) &
  (NonNullable<TValue> extends readonly string[]
    ? MultiChoiceFilterMethods
    : object);

// --- FilterBuilder Proxy ---

import type { IEntity } from "../types.js";
import type { EntityType } from "../Metadata/EntityType.js";
import {
  ModelConfigurationException,
  InvalidOperationException,
} from "../errors.js";
import { normalizeFolderPath } from "../Save/folderPath.js";

/** Reserved folder refinements available on every filter builder (they shadow same-named entity properties). */
export interface FolderFilterMethods {
  /** Scope to a list-relative folder path. Exact by default; { recursive: true } matches the whole subtree. */
  inFolder(path: string, opts?: { recursive?: boolean }): FilterNode;
  /** Include folder/container rows in results (excluded by default). Position-independent annotation. */
  includeFolders(): FilterNode;
}

export type FilterBuilder<T> = {
  // `-?` strips the entity's optional modifiers so `b.Field.op()` works on optional
  // properties (e.g. `Title?: string`); without it the mapped property is `… | undefined`.
  [K in keyof T]-?: NonNullable<T[K]> extends Date
    ? PropertyFilterType<T[K]>
    : NonNullable<T[K]> extends readonly unknown[]
      ? PropertyFilterType<T[K]>
      : NonNullable<T[K]> extends object
        ? FilterBuilder<NonNullable<T[K]>> // reference navigation: descend
        : PropertyFilterType<T[K]>;
} & FolderFilterMethods;

export function createFilterBuilder<T extends IEntity>(
  entityType: EntityType<T>,
): FilterBuilder<T> {
  return createFilterBuilderProxy(entityType, "") as FilterBuilder<T>;
}

function createFilterBuilderProxy(
  entityType: EntityType<IEntity>,
  pathPrefix: string,
): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_target, key) {
      if (typeof key !== "string") return undefined;
      // Reserved refinements — resolved before property lookup, so they shadow
      // same-named entity properties (documented; collisions are implausible).
      if (key === "inFolder") {
        return (path: string, opts?: { recursive?: boolean }): FilterNode => {
          const normalized = normalizeFolderPath(path);
          if (normalized === "") {
            throw new InvalidOperationException(
              `inFolder() requires a non-empty list-relative folder path.`,
            );
          }
          return {
            kind: "container-scope",
            path: normalized,
            recursive: opts?.recursive ?? false,
          };
        };
      }
      if (key === "includeFolders") {
        return (): FilterNode => ({ kind: "include-containers" });
      }
      const prop = entityType.findProperty(key);
      if (prop) {
        if (!pathPrefix) {
          return new PropertyFilter(prop);
        }
        // Synthesize a Property whose columnName is the slash-path.
        const synth = new Property({
          propertyName: prop.propertyName,
          columnName: `${pathPrefix}/${prop.columnName}`,
          displayName: prop.displayName,
          config: prop.config,
          required: prop.required,
          readOnly: prop.readOnly,
          key: false,
          indexed: prop.indexed,
        });
        return new PropertyFilter(synth);
      }
      // Try navigation.
      const nav = entityType.findNavigation(key);
      if (nav && nav.kind === "reference") {
        const newPrefix = pathPrefix ? `${pathPrefix}/${key}` : key;
        return createFilterBuilderProxy(nav.target, newPrefix);
      }
      // Collection navs cannot be traversed in `where`.
      // Unknown keys (and collection-nav access) throw.
      throw new ModelConfigurationException(
        `Property '${key}' is not configured on entity ${entityType.ctor.name}.`,
      );
    },
  });
}
