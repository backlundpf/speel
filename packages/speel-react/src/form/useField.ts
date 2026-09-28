import { useContext } from "react";
import { useStore } from "@tanstack/react-form";
import {
  buildValidations,
  collectErrors,
  resolveState,
  type DbSet,
  type FieldConfig,
  type FieldContext,
  type IEntity,
  type INavigation,
} from "@speel/core";
import { useSpeelContext } from "../context.js";
import { useEntityFormContext } from "./useEntityForm.js";
import { optionsSourceFor } from "./optionsSource.js";
import { createFor } from "./optionsCreator.js";
import { SurfaceCtx } from "../surface/SurfaceManager.js";
import type { FieldHandle } from "./FieldHandle.js";

/**
 * One field's reactive FieldHandle from the surrounding entity form. Display errors
 * are computed directly from core's `buildValidations` against the live draft values
 * (deterministic, independent of TanStack field registration); `touched` is the
 * form's UI-only touched state. Selection fields also get `options`, an `OptionsSource`.
 */
export function useField<TValue = unknown>(name: string): FieldHandle<TValue> {
  const { form, et, mode, touched, markTouched } = useEntityFormContext();
  const db = useSpeelContext();
  const surfaces = useContext(SurfaceCtx);
  const nav = et.findNavigation(name) as INavigation | undefined;
  const field = et.findProperty(name) ?? nav;
  if (!field)
    throw new Error(`useField: '${name}' is not a field of ${et.ctor.name}.`);

  const values = useStore(form.store, (s) => s.values) as Record<
    string,
    unknown
  >;
  // While a submit is awaiting the save, every input is disabled (spec:
  // disable-fields-while-saving). Read-only/view fields render as displays
  // and are unaffected; the gate re-opens when the promise settles.
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting as boolean);
  const value = values[name] as TValue;
  const ctx: FieldContext = { values, value, mode };
  const errors = collectErrors(buildValidations(field), ctx);

  const set = nav
    ? (db.set(nav.target.ctor) as unknown as DbSet<IEntity>)
    : undefined;
  const options = optionsSourceFor({
    config: field.config as FieldConfig,
    db,
    ...(set !== undefined ? { set } : {}),
    values,
  });
  const create = createFor({
    config: field.config as FieldConfig,
    db,
    ...(set !== undefined ? { set } : {}),
    values,
    surfaces,
  });

  return {
    name,
    mode,
    config: field.config,
    displayName: field.displayName,
    value,
    values,
    visible: resolveState(field.visible, ctx),
    readOnly: field.readOnly,
    enabled:
      field.readOnly || isSubmitting ? false : resolveState(field.enabled, ctx),
    required: resolveState(field.required, ctx),
    errors,
    touched: Boolean(touched[name]),
    render: field.render
      ? (field.render(ctx) as FieldHandle<TValue>["render"])
      : undefined,
    setValue: (v) => form.setFieldValue(name, v),
    markTouched: () => markTouched(name),
    ...(nav ? { storage: nav.storage } : {}),
    ...(options !== undefined ? { options } : {}),
    ...(create !== undefined ? { create } : {}),
  };
}
