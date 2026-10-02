import type { FieldStateFn } from "../types.js";
import type { ValidationRule, FieldRenderFn } from "./Validation.js";
import type { IFieldState } from "./IFieldState.js";
import type { FieldConfig } from "./FieldConfig.js";
import type { TableFilterConfig } from "./TableFilterConfig.js";
import { codecFor } from "./valueCodec.js";
export type { SpFieldType } from "./FieldConfig.js";

/**
 * How a property's value crosses a boundary. Two pairs, one container:
 *
 * - `toWire` / `fromWire` — speel's OWN wire, the JSON inside a Json column.
 *   Defaulted per field kind (DateTime ↔ ISO); `Materialize` and `PayloadBuilder`
 *   never touch these, because the column's wire belongs to the provider.
 * - `toProvider` / `fromProvider` — the author's layer, a model type ↔ the field's
 *   typed value, applied at the column boundary and again per property inside JSON.
 */
export interface IValueCodec {
  toWire?(value: unknown): unknown;
  fromWire?(raw: unknown): unknown;
  toProvider?(model: unknown): unknown;
  fromProvider?(provider: unknown): unknown;
}

export interface IPropertyInit {
  propertyName: string;
  columnName: string;
  displayName: string;
  description?: string;
  config: FieldConfig;
  required: boolean | FieldStateFn<unknown>;
  readOnly: boolean;
  /** The provider owns this column: never provisioned. Default false. */
  systemGenerated?: boolean;
  key: boolean;
  indexed?: boolean;
  defaultValue?: unknown;
  codec?: IValueCodec;
  visible?: boolean | FieldStateFn<unknown>;
  enabled?: boolean | FieldStateFn<unknown>;
  render?: FieldRenderFn;
  tableFilter?: TableFilterConfig;
  customValidations?: readonly ValidationRule[];
}

export class Property implements IFieldState {
  public readonly propertyName: string;
  public readonly columnName: string;
  public readonly displayName: string;
  public readonly description: string | undefined;
  public config: FieldConfig;
  /**
   * How this property's value crosses a boundary — the kind's wire pair merged
   * with the author's provider pair (the author's slots win where both define
   * one). `Materialize` and `PayloadBuilder` read only `toProvider`/`fromProvider`;
   * `toWire`/`fromWire` are for a Json column's own contents.
   */
  public readonly codec: IValueCodec | undefined;
  public readonly required: boolean | FieldStateFn<unknown>;
  /** Never sent to the provider (skipped at save). */
  public readonly readOnly: boolean;
  /** The provider owns this column (a built-in): migrations never provision it. */
  public readonly systemGenerated: boolean;
  public readonly key: boolean;
  public readonly indexed: boolean;
  public readonly defaultValue: unknown;
  public readonly visible: boolean | FieldStateFn<unknown>;
  public readonly enabled: boolean | FieldStateFn<unknown>;
  public readonly render?: FieldRenderFn;
  public readonly tableFilter?: TableFilterConfig;
  private readonly _customValidations: readonly ValidationRule[];
  get customValidations(): readonly ValidationRule[] {
    return this._customValidations;
  }

  constructor(init: IPropertyInit) {
    this.propertyName = init.propertyName;
    this.columnName = init.columnName;
    this.displayName = init.displayName;
    this.description = init.description;
    this.config = init.config;
    const kind = codecFor(init.config, init.propertyName);
    const merged = { ...kind, ...init.codec };
    this.codec = Object.keys(merged).length > 0 ? merged : undefined;
    this.required = init.required;
    this.visible = init.visible ?? true;
    this.enabled = init.enabled ?? true;
    if (init.render !== undefined) this.render = init.render;
    if (init.tableFilter !== undefined) this.tableFilter = init.tableFilter;
    this._customValidations = init.customValidations
      ? [...init.customValidations]
      : [];
    this.readOnly = init.readOnly;
    this.systemGenerated = init.systemGenerated ?? false;
    this.key = init.key;
    this.indexed = init.indexed ?? false;
    this.defaultValue = init.defaultValue;
    // NOTE: not Object.freeze'd because config.target (Lookup/User) is resolved
    // after construction by ModelBuilder.build() once all entity types exist.
  }
}
