import {
  buildValidations,
  collectErrors,
  type EntityType,
  type FieldContext,
  type FormMode,
} from "@speel/core";

export interface FormErrors {
  fields: Record<string, string | undefined>;
  form: string | undefined;
}

/**
 * Run core's rules for every field plus entity-level against a values record,
 * shaped as TanStack Form's form-level validator return (`{ fields, form }`).
 */
export function buildFormErrors(
  et: EntityType,
  values: Record<string, unknown>,
  mode: FormMode,
): FormErrors {
  const fields: Record<string, string | undefined> = {};

  // A navigation's backing FK column is hidden from the form (EntityFields excludes it) and is
  // driven by the nav's own field — its value is never set directly. Validating it would make a
  // required lookup (whose FK column inherits `required`) permanently invalid, since the user can
  // never satisfy a field that isn't rendered. The nav still carries the required rule, so the
  // relationship is still enforced.
  const fkColumns = new Set(
    et.navigations().map((n) => n.foreignKey.propertyName),
  );

  for (const prop of et.properties) {
    // The key is server-assigned (absent during create) and never user-edited — skip it,
    // otherwise an auto-required key blocks create submits.
    if (prop.key) continue;
    if (fkColumns.has(prop.propertyName)) continue;
    const ctx: FieldContext = {
      values,
      value: values[prop.propertyName],
      mode,
    };
    fields[prop.propertyName] = collectErrors(buildValidations(prop), ctx)[0];
  }

  for (const nav of et.navigations()) {
    const ctx: FieldContext = { values, value: values[nav.name], mode };
    // navigations carry no config-derived refinement; required + custom rules still apply
    fields[nav.name] = collectErrors(
      buildValidations({
        required: nav.required,
        displayName: nav.displayName,
        customValidations: nav.customValidations,
      }),
      ctx,
    )[0];
  }

  return { fields, form: buildEntityError(et, values, mode) };
}

/**
 * The entity-level (form-scoped) message alone — `hasValidation` rules declared on the
 * entity rather than a field. The form's error region renders this; `buildFormErrors`
 * folds the same result into its `form` slot.
 */
export function buildEntityError(
  et: EntityType,
  values: Record<string, unknown>,
  mode: FormMode,
): string | undefined {
  const ctx: FieldContext = { values, value: undefined, mode };
  return collectErrors(et.validations, ctx)[0];
}
