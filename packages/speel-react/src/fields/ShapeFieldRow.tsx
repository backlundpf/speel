import type { FormMode, Property } from "@speel/core";
import { useStandaloneField } from "../form/useStandaloneField.js";
import { SpeelField } from "./SpeelField.js";

/**
 * One property of a shape, as an ordinary field.
 *
 * A component rather than a loop body because `useStandaloneField` is a hook: one
 * call per component keeps the hook count fixed no matter what the shape declares.
 */
export function ShapeFieldRow({
  property,
  value,
  mode,
  enabled,
  touched,
  onChange,
}: {
  property: Property;
  value: unknown;
  mode: FormMode;
  enabled: boolean;
  /**
   * The PARENT Json field's `touched`. A row's own `markTouched` is a no-op (there is
   * no form behind a standalone field), so without this a freshly added row would
   * paint its "required" message before the user had typed a character. The parent's
   * signal flips on the form's `markAllTouched()`, i.e. a submit attempt — the same
   * moment the shape-level summary appears.
   */
  touched: boolean;
  onChange: (next: unknown) => void;
}): JSX.Element {
  const field = useStandaloneField({
    config: property.config,
    displayName: property.displayName,
    value,
    onChange,
    // `required` may be a predicate (FieldStateFn); useStandaloneField's option is a
    // plain boolean, and a standalone field has no cross-property values snapshot to
    // evaluate a predicate against anyway — so only a literal `true` counts, the same
    // rule shapeCodec's `elementErrors` applies when it validates a shape's own value.
    required: property.required === true,
    customValidations: property.customValidations,
    mode,
    enabled,
    touched,
  });
  return <SpeelField field={field} />;
}
