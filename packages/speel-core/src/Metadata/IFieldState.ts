import type { FieldStateFn } from "../types.js";
import type { ValidationRule, FieldRenderFn } from "./Validation.js";
import type { TableFilterConfig } from "./TableFilterConfig.js";

/** The presentation surface shared by Property and Navigation. */
export interface IFieldState {
  readonly displayName: string;
  readonly required: boolean | FieldStateFn<unknown>;
  readonly visible: boolean | FieldStateFn<unknown>;
  readonly enabled: boolean | FieldStateFn<unknown>;
  readonly readOnly: boolean;
  readonly render?: FieldRenderFn;
  readonly tableFilter?: TableFilterConfig;
  /** Modeler-declared rules only; the full set is composed via buildValidations(). */
  readonly customValidations: readonly ValidationRule[];
}
