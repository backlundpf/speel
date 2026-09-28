import { FieldBuilderBase } from "./FieldBuilderBase.js";
import { Property } from "../../Metadata/Property.js";
import type {
  FieldConfig,
  SelectionOptions,
} from "../../Metadata/FieldConfig.js";
import type {
  ChoiceOptionsLoader,
  OptionsThunk,
} from "../../Metadata/optionsLoader.js";
import type { OptionContext } from "../../types.js";
import { ModelConfigurationException } from "../../errors.js";
import type { ChoiceFieldOptions } from "./FieldOptions.js";
import { recordField, type DecoratedValue } from "../decorators.js";
import type { PropertyBuilder } from "../PropertyBuilder.js";

type OptionsQuery = NonNullable<SelectionOptions<unknown>["optionsQuery"]>;
type ElementOf<T> = T extends readonly (infer E)[] ? E : T;

/**
 * One builder for both single (`multi: false`) and multi (`multi: true`) selection.
 * `PropertyBuilder.isMultiChoice()` calls `asMultiChoice()` to set the `_isMultiChoice`
 * flag (the runtime multiplicity signal, since `TValue` is erased). All other knobs live
 * in the shared `config` object — populated either by routed options or the fluent setters.
 */
export class ChoiceFieldBuilder<TValue = string> extends FieldBuilderBase<
  ChoiceFieldBuilder<TValue>
> {
  private _isMultiChoice = false;

  constructor(opts?: Record<string, unknown>) {
    super(opts);
  }
  protected self(): ChoiceFieldBuilder<TValue> {
    return this;
  }

  /** @internal — flips this field to multi-select (called by PropertyBuilder.isMultiChoice). */
  asMultiChoice(): this {
    this._isMultiChoice = true;
    return this;
  }

  /**
   * The set to choose from: a literal list, or a thunk taking `{ db }` that is
   * evaluated once per field instance (never at model build).
   */
  hasOptions(
    options: readonly ElementOf<TValue>[] | OptionsThunk<ElementOf<TValue>>,
  ): this {
    this.config.options =
      typeof options === "function" ? options : [...options];
    return this;
  }

  /** Client-side SEARCH over the options in hand. Default: substring over rendered text. */
  hasOptionsQuery(
    query: (
      q: string,
      options: readonly ElementOf<TValue>[],
    ) => readonly ElementOf<TValue>[],
  ): this {
    this.config.optionsQuery = query as OptionsQuery;
    return this;
  }

  /** Server-side: ask per search term. A Choice has no target, so the loader gets `db`. */
  hasOptionsQueryAsync<E = Record<string, unknown>>(
    loader: ChoiceOptionsLoader<E, ElementOf<TValue>>,
  ): this {
    this.config.optionsQueryAsync = loader as ChoiceOptionsLoader;
    return this;
  }

  /** @presentation — value key for the picker; not used by core's read/write path. */
  hasOptionsValue(value: (o: ElementOf<TValue>) => unknown): this {
    this.config.optionsValue = value as (o: unknown) => unknown;
    return this;
  }

  /** @presentation — display renderer; not used by core's read/write path. */
  hasOptionsRender<R>(render: (o: ElementOf<TValue>) => R): this {
    this.config.optionsRender = render as (o: unknown) => unknown;
    return this;
  }

  /** State-dependent availability: which options are selectable for a given entity. */
  hasOptionsFilter<E = Record<string, unknown>>(
    predicate: (ctx: OptionContext<E>) => boolean,
  ): this {
    this.config.optionsFilter = predicate as (ctx: OptionContext) => boolean;
    return this;
  }
  /** Render as a radio group instead of the combobox — the only rendering opt-in. */
  asRadioButtons(): this {
    this.config.radioButtons = true;
    return this;
  }
  allowFillIn(value: boolean = true): this {
    this.config.fillIn = value;
    return this;
  }

  protected emitConfig(): FieldConfig {
    const c = this.config;
    return {
      kind: "Choice",
      multi: this._isMultiChoice,
      fillIn: (c.fillIn as boolean | undefined) ?? false,
      radioButtons: (c.radioButtons as boolean | undefined) ?? false,
      // A literal list is copied; a thunk passes through un-invoked.
      ...(c.options
        ? {
            options:
              typeof c.options === "function"
                ? (c.options as OptionsThunk)
                : [...(c.options as readonly unknown[])],
          }
        : {}),
      ...(c.optionsQuery
        ? { optionsQuery: c.optionsQuery as OptionsQuery }
        : {}),
      ...(c.optionsQueryAsync
        ? { optionsQueryAsync: c.optionsQueryAsync as ChoiceOptionsLoader }
        : {}),
      ...(c.optionsValue
        ? { optionsValue: c.optionsValue as (o: unknown) => unknown }
        : {}),
      ...(c.optionsRender
        ? { optionsRender: c.optionsRender as (o: unknown) => unknown }
        : {}),
      ...(c.optionsFilter
        ? { optionsFilter: c.optionsFilter as (ctx: OptionContext) => boolean }
        : {}),
    };
  }

  /** @internal */
  override build(propertyName: string, key: boolean): Property {
    const options = this.config.options as
      readonly unknown[] | OptionsThunk | undefined;
    const queried = this.config.optionsQueryAsync !== undefined;
    // A Choice has no target to fall back on, so it must say where its list comes from.
    const empty = Array.isArray(options) && options.length === 0;
    if ((options === undefined && !queried) || empty) {
      throw new ModelConfigurationException(
        `Choice field '${propertyName}' requires hasOptions(...) with at least one option, a thunk, or hasOptionsQueryAsync(...).`,
      );
    }
    return super.build(propertyName, key);
  }
}

/** Field decorator declaring a single-select choice property; `T` comes from the property; `options` is checked against it. */
export function ChoiceField<T>(opts: ChoiceFieldOptions<T>) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<T>>,
  ): void =>
    recordField(ctx, (eb) => {
      (eb.property(ctx.name as string) as PropertyBuilder<unknown>).isChoice(
        opts as ChoiceFieldOptions<unknown>,
      );
    });
}

/** Field decorator declaring a multi-select choice property; `T` is the element type, from the property; `options` is checked against it. */
export function MultiChoiceField<T>(opts: ChoiceFieldOptions<T>) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<T[]>>,
  ): void =>
    recordField(ctx, (eb) => {
      (
        eb.property(ctx.name as string) as PropertyBuilder<unknown>
      ).isMultiChoice(opts as ChoiceFieldOptions<unknown>);
    });
}
