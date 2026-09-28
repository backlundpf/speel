import type { ReactNode } from "react";
import type { FieldConfig, FormMode, NavigationStorage } from "@speel/core";

/**
 * Where a selection field's (Choice or Lookup) options come from, resolved to a
 * single shape regardless of which of the three states (spec: "Three states, one
 * axis") produced it.
 *
 * - `"list"` — `load()` once per field instance; the caller searches the result
 *   client-side. Covers a declared `options` (array or thunk) and a lookup that
 *   declared neither (the uncapped, load-the-target's-rows-once default).
 * - `"query"` — `load(query)` per search term; the source does the searching.
 *   Covers a declared `optionsQueryAsync`.
 */
export interface OptionsSource {
  readonly mode: "list" | "query";
  load(query?: string): Promise<unknown[]>;
}

/**
 * The reactive, engine-agnostic handle a field component consumes. Produced by
 * `useField` (inside an entity form) or `useStandaloneField` (form-less). Neither
 * the form engine nor the UI library leaks through this surface.
 */
export interface FieldHandle<TValue = unknown> {
  readonly name: string;
  readonly mode: FormMode;
  readonly config: FieldConfig | undefined;
  readonly displayName: string;
  readonly value: TValue;
  /**
   * The draft this field belongs to, keyed by propertyName — the same snapshot its
   * predicates see as `FieldContext.values`. A standalone field's draft is itself alone.
   */
  readonly values: Readonly<Record<string, unknown>>;
  readonly visible: boolean;
  /** false if `isReadOnly` OR predicate-disabled. */
  readonly enabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly errors: readonly string[];
  readonly touched: boolean;
  /** Result of the property's render override (opaque to core), or undefined. */
  readonly render: ReactNode | undefined;
  /** Navigation storage strategy, if this field is a navigation. */
  readonly storage?: NavigationStorage;
  setValue(v: TValue): void;
  markTouched(): void;
  /** For a Choice or Lookup field: where its options come from. Undefined otherwise. */
  readonly options?: OptionsSource;
  /**
   * For a selection field that can take a value not in its list: a lookup declaring
   * `optionsCreateAsync`, or a fill-in Choice. Resolves the created value — a saved
   * target row, or the text itself for a Choice — or `undefined` when the user declined.
   * Absent when the field cannot create.
   */
  create?(text: string): Promise<unknown | undefined>;
}
