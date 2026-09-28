import type { EntityCtor, OptionContext } from "../../types.js";
import type {
  OptionsCreator,
  OptionsLoader,
  OptionsThunk,
} from "../../Metadata/optionsLoader.js";
import type { FieldOptions } from "../fieldTypes/FieldOptions.js";
import {
  applyRefinement,
  REFINEMENT_KEYS,
} from "../fieldTypes/FieldStateBuilder.js";
import type { RelationshipBuilder } from "./NavConfig.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRelationshipBuilder = RelationshipBuilder<any, any, any>;

/** Decorator options for a navigation: the shared refinement surface + nav-specific keys. */
export interface NavOptions<TTarget> extends FieldOptions {
  /** Selector over the target naming the inverse nav property. */
  inverse?: (t: TTarget) => unknown;
  /** FK column name on self (else inferred NavName+'Id'). */
  foreignKey?: string;
  /** Selector over the target's display column. */
  displayField?: (t: TTarget) => unknown;
  /** The set to choose from; a thunk taking `{ db }` is evaluated once per field instance. */
  options?: readonly TTarget[] | OptionsThunk<TTarget>;
  /** Client-side SEARCH over the options in hand. */
  optionsQuery?: (
    query: string,
    options: readonly TTarget[],
  ) => readonly TTarget[];
  /** Client-side availability predicate over options already in hand. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  optionsFilter?: (ctx: OptionContext<any>) => boolean;
  /** Server-side: run per search term, replacing the default load entirely. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  optionsQueryAsync?: OptionsLoader<any, any>;
  /** How to create the target row when the typed text matches nothing. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  optionsCreateAsync?: OptionsCreator<any, any>;
  optionsValue?: (o: TTarget) => unknown;
  optionsRender?: (o: TTarget) => unknown;
}
/** @OneToMany requires the inverse (the FK lives on the child). */
export type OneToManyOptions<T> = NavOptions<T> & {
  inverse: (t: T) => unknown;
};

/** Thunk for a circular-import-safe target reference. */
export type TargetThunk<T extends import("../../types.js").IEntity> =
  () => EntityCtor<T>;

const NAV_PASS_THROUGH: Record<
  string,
  (rb: AnyRelationshipBuilder, v: unknown) => void
> = {
  foreignKey: (rb, v) => rb.hasForeignKey(v as string),
  displayField: (rb, v) => rb.hasDisplayField(v as (t: unknown) => unknown),
  options: (rb, v) => rb.hasOptions(v as never),
  optionsQuery: (rb, v) => rb.hasOptionsQuery(v as never),
  optionsQueryAsync: (rb, v) => rb.hasOptionsQueryAsync(v as never),
  optionsCreateAsync: (rb, v) => rb.hasOptionsCreateAsync(v as never),
  optionsFilter: (rb, v) => rb.hasOptionsFilter(v as never),
  optionsValue: (rb, v) => rb.hasOptionsValue(v as never),
  optionsRender: (rb, v) => rb.hasOptionsRender(v as never),
};

/** Route nav options: refinement keys → the draft; nav keys → RelationshipBuilder methods. `inverse` is consumed by withMany/withOne upstream. */
export function applyNavOptions(
  rb: AnyRelationshipBuilder,
  opts: Record<string, unknown>,
): void {
  for (const [k, v] of Object.entries(opts)) {
    if (v === undefined || k === "inverse") continue;
    if (REFINEMENT_KEYS.has(k)) {
      applyRefinement(rb.navState(), k, v);
      continue;
    }
    NAV_PASS_THROUGH[k]?.(rb, v);
  }
}
