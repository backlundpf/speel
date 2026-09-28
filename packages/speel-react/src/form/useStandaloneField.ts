import {
  buildValidations,
  collectErrors,
  type FieldConfig,
  type FieldContext,
  type FormMode,
  type ValidationRule,
} from "@speel/core";
import { useContext } from "react";
import { DbContextReact } from "../context.js";
import type { FieldHandle } from "./FieldHandle.js";
import { optionsSourceFor } from "./optionsSource.js";
import { createFor } from "./optionsCreator.js";
import { SurfaceCtx } from "../surface/SurfaceManager.js";

export interface StandaloneFieldOptions<TValue> {
  config: FieldConfig;
  displayName: string;
  value: TValue;
  onChange: (v: TValue) => void;
  required?: boolean;
  customValidations?: readonly ValidationRule[];
  mode?: FormMode;
  /**
   * Whether the control accepts input. Default true. A form-bound field gets this from the
   * model; a standalone one has no model to ask, so the caller supplies it — typically to
   * lock the field while a save it feeds is in flight.
   *
   * This is not `readOnly`: a disabled field still renders as an input, while `mode: 'view'`
   * renders the formatted value instead.
   */
  enabled?: boolean;
  /**
   * Whether this field's errors may be shown yet. Default true — a lone field (a search
   * box, a filter) has no submit to wait for, so its message is the immediate answer to
   * what the caller just typed.
   *
   * A standalone field cannot work this out for itself: it has no form, so its own
   * `markTouched` is a no-op and nothing would ever flip it. A caller that DOES have a
   * notion of "the user has engaged with this" — a shape's editor, whose rows are
   * standalone fields inside a real form field — passes that signal down instead, so a
   * blank required property does not accuse the user before they have typed anything.
   */
  touched?: boolean;
}

/**
 * A controlled, form-less FieldHandle — for a lone field used outside an entity
 * form (e.g. a Text field in a search box). The caller owns the value via
 * `value`/`onChange`.
 *
 * No DbContext is required. A selection field gets `options` from the same
 * `optionsSourceFor` a form-bound field uses: a literal list needs no provider; a
 * thunk or a query uses the surrounding `<SpeelProvider>`'s DbContext and throws a
 * clear error when there is none.
 */
export function useStandaloneField<TValue = unknown>(
  opts: StandaloneFieldOptions<TValue>,
): FieldHandle<TValue> {
  const mode: FormMode = opts.mode ?? "edit";
  // Read directly, not via useSpeelContext: that throws without a provider, and a
  // standalone field must not need one unless its options do.
  const db = useContext(DbContextReact) ?? undefined;
  const surfaces = useContext(SurfaceCtx);
  const values = { [opts.displayName]: opts.value };
  const options = optionsSourceFor({
    config: opts.config,
    ...(db ? { db } : {}),
    values,
  });
  // A standalone field has no navigation, so no set: only a fill-in Choice creates here.
  const create = createFor({ config: opts.config, db, values, surfaces });
  const ctx: FieldContext = {
    values,
    value: opts.value,
    mode,
  };
  const rules = buildValidations({
    config: opts.config,
    required: opts.required ?? false,
    displayName: opts.displayName,
    customValidations: opts.customValidations ?? [],
  });
  return {
    name: opts.displayName,
    mode,
    config: opts.config,
    displayName: opts.displayName,
    value: opts.value,
    values,
    visible: true,
    readOnly: false,
    enabled: opts.enabled ?? true,
    required: opts.required ?? false,
    errors: collectErrors(rules, ctx),
    touched: opts.touched ?? true,
    render: undefined,
    setValue: opts.onChange,
    markTouched: () => {},
    ...(options !== undefined ? { options } : {}),
    ...(create !== undefined ? { create } : {}),
  };
}
