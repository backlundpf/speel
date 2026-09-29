import { FieldBuilderBase } from "./FieldBuilderBase.js";
import type { EntityType } from "../../Metadata/EntityType.js";
import type {
  FieldConfig,
  JsonFieldConfig,
} from "../../Metadata/FieldConfig.js";
import type { IValueCodec } from "../../Metadata/Property.js";
import type { EntityCtor, IEntity } from "../../types.js";
import type { JsonFieldOptions } from "./FieldOptions.js";
import { recordField, type DecoratedValue } from "../decorators.js";
import type { PropertyBuilder } from "../PropertyBuilder.js";
import { ModelConfigurationException } from "../../errors.js";
import { shapeCodec, shapeValueErrors } from "./shapeCodec.js";
import type { ValidationRule } from "../../Metadata/Validation.js";

/**
 * One builder for both `Json` and `MultiJson`, exactly as ChoiceFieldBuilder serves
 * single and multi selection: the verb flips `_isMulti`, everything else is shared.
 *
 * The shape arrives as a thunk and is resolved to its EntityType by
 * ModelBuilder.build(), once every type exists — the same late resolution a Lookup's
 * target gets.
 */
export class JsonFieldBuilder extends FieldBuilderBase<JsonFieldBuilder> {
  private _isMulti = false;
  /** @internal — read by ModelBuilder.build() to resolve `config.shape`. */
  shapeThunk: (() => EntityCtor<IEntity>) | undefined;
  /**
   * This builder is registered once per decorated class (see ENTITY_REGISTRY) and
   * `build()` may run against it many times — every `ModelBuilder.build()` call for
   * that class, not just one. The rule below closes over the specific `fieldConfig`
   * object of the build that created it, so a stale rule from an earlier build must
   * be replaced, not left to accumulate alongside a new one each time.
   */
  private _shapeValidationRule: ValidationRule | undefined;

  protected self(): JsonFieldBuilder {
    return this;
  }

  /** @internal — flips this field to an array of shapes. */
  asMulti(): this {
    this._isMulti = true;
    return this;
  }

  /** @internal */
  ofShape(thunk: () => EntityCtor<IEntity>): this {
    this.shapeThunk = thunk;
    return this;
  }

  protected emitConfig(): FieldConfig {
    return {
      kind: "Json",
      multi: this._isMulti,
      // Resolved in ModelBuilder.build(); a placeholder until then, like a Lookup's target.
      shape: undefined as unknown as EntityType,
    };
  }

  /**
   * A Json field owns its codec — the shape is what describes the value, so a
   * caller-supplied one (`.hasCodec()`, or a decorator's `codec` option) is
   * a model-construction error rather than something to honor or silently drop.
   *
   * `fieldConfig` here is the exact `JsonFieldConfig` this builder just emitted —
   * still carrying its shape placeholder. `shapeCodec` closes over it and reads
   * `config.shape` only when `fromProvider`/`toProvider` actually run, which is after
   * ModelBuilder.build()'s pendingShapes pass has resolved it.
   *
   * Also attaches the property's own validation: a nested field validates and shows
   * its own message, but the parent form never asks a shape's properties directly —
   * it only ever sees the rules on the Json property itself, so a required nested
   * field with nothing filled in would otherwise block no submit. `resolveCodec` runs
   * before `Property.customValidations` is copied (see FieldBuilderBase.build()), so
   * attaching here — not in the constructor, before the shape thunk is even set —
   * still lands in the built Property. The rule reads `fieldConfig.shape` inside
   * `validate`, every time it runs, for the same reason `shapeCodec` does: at build
   * time it is still the placeholder.
   */
  protected override resolveCodec(
    fieldConfig: FieldConfig,
    propertyName: string,
  ): IValueCodec {
    if (this.state().codec !== undefined) {
      throw new ModelConfigurationException(
        `${propertyName}: a Json field owns its codec — the shape is what describes the value.`,
      );
    }
    const jsonConfig = fieldConfig as JsonFieldConfig;
    const multi = this._isMulti;
    let messages: string[] = [];
    const rule: ValidationRule = {
      validate: (ctx) => {
        messages = shapeValueErrors(jsonConfig.shape, ctx.value, multi);
        return messages.length === 0;
      },
      get message() {
        return messages[0] ?? "";
      },
    };
    // Mutating the draft here reaches the built Property only because of something
    // one file away: `FieldBuilderBase.build()` calls `buildFieldState` BEFORE
    // `resolveCodec`, and `buildFieldState` (FieldStateBuilder.ts) puts
    // `s.customValidations` into the IFieldState by REFERENCE — it does not copy.
    // So the array `build()` is holding is this same array, and the rule pushed (or
    // swapped) below is still in it when `new Property(...)` finally copies it.
    //
    // If `buildFieldState` ever copies instead, this push lands in an array that
    // build has already snapshotted: the FIRST build of a class produces a Json
    // property with no shape validation at all, so an invalid shape stops blocking
    // its form's submit. And the suite would stay green — verified by making it copy
    // and running all 931 core tests. Every later build of the same class picks up
    // the rule THIS build pushed (the draft is per registered builder and outlives a
    // single `ModelBuilder.build()`), and a test file always builds a class more than
    // once before asserting; only the first build in a process — which is the only
    // one a real app ever does — is empty. Running that one test alone is what fails.
    // Copy there and this has to move into an override of `buildFieldState` instead.
    const customValidations = this.state().customValidations;
    const previous = this._shapeValidationRule;
    const at = previous ? customValidations.indexOf(previous) : -1;
    if (at >= 0) customValidations[at] = rule;
    else customValidations.push(rule);
    this._shapeValidationRule = rule;
    return shapeCodec(jsonConfig, propertyName);
  }
}

/** Field decorator declaring a single embedded shape stored as JSON. */
export function JsonField<T extends object>(opts: JsonFieldOptions<T>) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<T>>,
  ): void =>
    recordField(ctx, (eb) => {
      (eb.property(ctx.name as string) as PropertyBuilder<unknown>).isJson(
        opts,
      );
    });
}

/** Field decorator declaring an array of embedded shapes stored as JSON. */
export function MultiJsonField<T extends object>(opts: JsonFieldOptions<T>) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<T[]>>,
  ): void =>
    recordField(ctx, (eb) => {
      (eb.property(ctx.name as string) as PropertyBuilder<unknown>).isMultiJson(
        opts,
      );
    });
}
