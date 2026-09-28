import { Property } from "../../Metadata/Property.js";
import type { IValueCodec } from "../../Metadata/Property.js";
import type { FieldConfig } from "../../Metadata/FieldConfig.js";
import {
  newFieldStateDraft,
  applyRefinement,
  REFINEMENT_KEYS,
  type IFieldStateDraft,
} from "./FieldStateBuilder.js";
import { FieldRefinementBuilder } from "./FieldRefinementBuilder.js";
import { IFieldBuilder } from "../types.js";

export abstract class FieldBuilderBase<TSelf extends FieldBuilderBase<TSelf>>
  extends FieldRefinementBuilder<TSelf>
  implements IFieldBuilder
{
  private readonly _state = newFieldStateDraft();
  /** The narrow type-config slice; field builders write knobs here and spread it in emitConfig. */
  protected readonly config: Record<string, unknown> = {};

  /** Routes each option key: refinements → the field-state draft, everything else → config. */
  constructor(opts?: Record<string, unknown>) {
    super();
    for (const [k, v] of Object.entries(opts ?? {})) {
      if (v === undefined) continue;
      if (REFINEMENT_KEYS.has(k)) applyRefinement(this._state, k, v);
      else this.config[k] = v;
    }
  }

  protected abstract emitConfig(): FieldConfig;
  protected state(): IFieldStateDraft {
    return this._state;
  }

  /**
   * The Property's `codec`. Defaults to whatever `.hasCodec()` (or a decorator's
   * `codec` option) wrote into the field-state draft.
   *
   * A field type whose codec is not user-suppliable, but derived from its own
   * type config instead — a Json field's shape — overrides this rather than the
   * caller writing to `Property.codec` directly, which is readonly. The
   * `fieldConfig` handed in is the exact object that becomes `Property.config`, so
   * an override may close over it and read a field ModelBuilder.build() resolves
   * later (see JsonFieldBuilder / shapeCodec).
   */
  protected resolveCodec(
    _fieldConfig: FieldConfig,
    _propertyName: string,
  ): IValueCodec | undefined {
    return this._state.codec;
  }

  /** @internal */
  build(propertyName: string, key: boolean): Property {
    const s = this._state;
    const displayName = s.displayName ?? s.columnName ?? propertyName;
    const fieldState = this.buildFieldState(displayName, s.readOnly);
    const fieldConfig = this.emitConfig();
    const codec = this.resolveCodec(fieldConfig, propertyName);
    return new Property({
      propertyName,
      columnName: s.columnName ?? propertyName,
      displayName,
      ...(s.description !== undefined ? { description: s.description } : {}),
      config: fieldConfig,
      required: fieldState.required,
      visible: fieldState.visible,
      enabled: fieldState.enabled,
      readOnly: s.readOnly,
      key,
      indexed: s.indexed,
      ...(s.hasDefault ? { defaultValue: s.defaultValue } : {}),
      ...(codec ? { codec } : {}),
      ...(fieldState.render ? { render: fieldState.render } : {}),
      ...(fieldState.tableFilter
        ? { tableFilter: fieldState.tableFilter }
        : {}),
      customValidations: fieldState.customValidations,
    });
  }
}
