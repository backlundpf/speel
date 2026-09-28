import { ModelConfigurationException } from "../../errors.js";
import { captureSelectorName } from "../../Metadata/selectorName.js";
import type { IEntity, EntityCtor, OptionContext } from "../../types.js";
import type { IFieldStateDraft } from "../fieldTypes/FieldStateBuilder.js";
import { FieldRefinementBuilder } from "../fieldTypes/FieldRefinementBuilder.js";
import type {
  OptionsCreator,
  OptionsLoader,
  OptionsThunk,
} from "../../Metadata/optionsLoader.js";

/** Records the single property name a selector touches, via a get-trap proxy. */
export function captureName<T>(selector: (e: T) => unknown): string {
  return captureSelectorName(
    selector as (e: never) => unknown,
    (m) => new ModelConfigurationException(m),
  );
}

/** Live config object shared by a navigation builder and its RelationshipBuilder. */
export interface INavConfig {
  readonly name: string;
  readonly kind: "reference" | "collection";
  readonly targetCtor: EntityCtor<IEntity>;
  /** 'self' = FK on the declaring entity (withMany); 'child' = FK on the target (withOne). */
  foreignKeySide?: "self" | "child";
  /** true only for a collection nav whose FK lives on self (multi-value lookup array). */
  isMultiValue: boolean;
  inverseNavName?: string;
  foreignKeyName?: string;
  displayField?: string;
  /** When true, the synthesized FK column is read-only (server-managed, e.g. Author/Editor). */
  readOnly?: boolean;
  /** Shared field-state draft (displayName, required, visible, enabled, render, validations). */
  fieldState: IFieldStateDraft;
  /** The set to choose from; a thunk is evaluated once per field instance. */
  options?: readonly unknown[] | OptionsThunk;
  /** Client-side SEARCH over the options in hand. */
  optionsQuery?: (
    query: string,
    options: readonly unknown[],
  ) => readonly unknown[];
  /** Client-side availability predicate over options already in hand. */
  optionsFilter?: (ctx: OptionContext) => boolean;
  /** Server-side: run per search term, replacing the default load entirely. */
  optionsQueryAsync?: OptionsLoader;
  /** How to create the target row when the typed text matches nothing. */
  optionsCreateAsync?: OptionsCreator;
  optionsValue?: (o: unknown) => unknown;
  optionsRender?: (o: unknown) => unknown;
}

/**
 * Terminal builder returned by withOne()/withMany(). `TFkOwner` is the entity that
 * physically holds the FK column; `TFk` constrains the FK selector's return type to
 * number (scalar) or number[] (multi-value).
 */
export class RelationshipBuilder<
  TFkOwner,
  TTarget,
  TFk extends number | number[],
> extends FieldRefinementBuilder<RelationshipBuilder<TFkOwner, TTarget, TFk>> {
  constructor(private readonly cfg: INavConfig) {
    super();
  }

  protected self(): RelationshipBuilder<TFkOwner, TTarget, TFk> {
    return this;
  }
  protected state(): IFieldStateDraft {
    return this.cfg.fieldState;
  }

  /** @internal — the live field-state draft, for applyNavOptions (state() is protected). */
  navState(): IFieldStateDraft {
    return this.cfg.fieldState;
  }

  hasForeignKey(
    selector: ((e: TFkOwner) => TFk | null | undefined) | string,
  ): this {
    this.cfg.foreignKeyName =
      typeof selector === "function"
        ? captureName(selector as (e: unknown) => unknown)
        : selector;
    return this;
  }
  hasDisplayField(selector: (t: TTarget) => unknown): this {
    this.cfg.displayField = captureName(selector as (e: unknown) => unknown);
    return this;
  }

  /** The set to choose from, loaded once per field instance and searched client-side. */
  hasOptions(options: readonly TTarget[] | OptionsThunk<TTarget>): this {
    this.cfg.options = options as readonly unknown[] | OptionsThunk;
    return this;
  }
  /** Client-side SEARCH over the options in hand. Default: substring over rendered text. */
  hasOptionsQuery(
    query: (q: string, options: readonly TTarget[]) => readonly TTarget[],
  ): this {
    this.cfg.optionsQuery = query as NonNullable<INavConfig["optionsQuery"]>;
    return this;
  }
  /**
   * Ask the source per search term, replacing the default load outright. The loader owns
   * its limits; `searchesDisplayField()` is the stock one (contains on the display column,
   * capped at OPTIONS_QUERY_TAKE).
   */
  hasOptionsQueryAsync(
    loader: OptionsLoader<TFkOwner, TTarget & IEntity>,
  ): this {
    this.cfg.optionsQueryAsync = loader as unknown as OptionsLoader;
    return this;
  }
  /**
   * How to create the target row when the typed text matches nothing:
   * `createsByDisplayField()` is the stock lookup creator. Valid only on the FK-owning
   * side — ModelBuilder throws for an inverse (withOne) navigation, which has no FK of
   * its own to create against.
   */
  hasOptionsCreateAsync(
    creator: OptionsCreator<TFkOwner, TTarget & IEntity>,
  ): this {
    this.cfg.optionsCreateAsync = creator as unknown as OptionsCreator;
    return this;
  }
  /**
   * Client-side availability: runs over options already in hand. For server-side
   * shaping — filter, cap, expand, a different set — use {@link hasOptionsQueryAsync}.
   */
  hasOptionsFilter(predicate: (ctx: OptionContext<TFkOwner>) => boolean): this {
    this.cfg.optionsFilter = predicate as (ctx: OptionContext) => boolean;
    return this;
  }
  /** An option's key in the picker (defaults to the target row's id). */
  hasOptionsValue<R>(value: (o: TTarget) => R): this {
    this.cfg.optionsValue = value as (o: unknown) => unknown;
    return this;
  }
  /** How one option renders in the picker; the FIELD's renderer is `render`. */
  hasOptionsRender<R>(render: (o: TTarget) => R): this {
    this.cfg.optionsRender = render as (o: unknown) => unknown;
    return this;
  }

  /** @internal */ getConfig(): INavConfig {
    return this.cfg;
  }
}
