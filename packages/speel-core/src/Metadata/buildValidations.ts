import type { FieldConfig } from "./FieldConfig.js";
import type { FieldStateFn } from "../types.js";
import {
  type ValidationRule,
  requiredRule,
  minLengthRule,
  maxLengthRule,
  minRule,
  maxRule,
  dateMinRule,
  dateMaxRule,
  choiceMembershipRule,
} from "./Validation.js";
import { declaredOptions } from "./selectionOptions.js";

/** The declarative inputs needed to compose a field's full rule set on demand. */
export interface ValidatableField {
  readonly config?: FieldConfig;
  readonly required: boolean | FieldStateFn<unknown>;
  readonly displayName: string;
  readonly customValidations: readonly ValidationRule[];
}

/** Config-derived constraint rules (the former per-builder `refinementRules`). */
export function refinementRulesFor(
  config: FieldConfig,
  displayName: string,
): ValidationRule[] {
  const rules: ValidationRule[] = [];
  switch (config.kind) {
    case "Text":
      if (config.minLength !== undefined)
        rules.push(minLengthRule(config.minLength, displayName));
      if (config.maxLength !== undefined)
        rules.push(maxLengthRule(config.maxLength, displayName));
      break;
    case "Number":
    case "Currency":
      if (config.min !== undefined)
        rules.push(minRule(config.min, displayName));
      if (config.max !== undefined)
        rules.push(maxRule(config.max, displayName));
      break;
    case "DateTime":
      if (config.min !== undefined)
        rules.push(dateMinRule(config.min, displayName));
      if (config.max !== undefined)
        rules.push(dateMaxRule(config.max, displayName));
      break;
    case "Choice": {
      // Fill-in choices accept arbitrary values, and a list that is not literal cannot be
      // checked synchronously — either way there is no membership constraint.
      const declared = declaredOptions(config);
      if (config.fillIn || declared === undefined) break;
      const keyOf = config.optionsValue ?? ((x: unknown) => x);
      rules.push(
        choiceMembershipRule(declared, keyOf, config.multi, displayName),
      );
      break;
    }
    // Boolean, Lookup, User: no config-derived refinement.
  }
  return rules;
}

/** Compose `required + config-derived refinement + custom` on demand. */
export function buildValidations(field: ValidatableField): ValidationRule[] {
  return [
    ...(field.required
      ? [requiredRule(field.required, field.displayName)]
      : []),
    ...(field.config
      ? refinementRulesFor(field.config, field.displayName)
      : []),
    ...field.customValidations,
  ];
}
