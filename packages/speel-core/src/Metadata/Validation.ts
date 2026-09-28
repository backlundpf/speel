import type { FieldContext, FieldStateFn } from "../types.js";

/** A declared validation rule. `validate` returns true when valid. */
export interface ValidationRule {
  validate: (ctx: FieldContext) => boolean;
  message: string;
}

/** A render override: opaque to core — the presentation layer interprets the result. */
export type FieldRenderFn = (ctx: FieldContext) => unknown;

/** Empty for required purposes: null/undefined/''/[]. 0 and false are NOT empty. */
export function isEmpty(value: unknown): boolean {
  return (
    value == null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Desugars a truthy `required` (static or predicate) into a validation rule. */
export function requiredRule(
  required: boolean | FieldStateFn<unknown>,
  displayName: string,
): ValidationRule {
  return {
    validate: (ctx) =>
      (typeof required === "function" ? required(ctx) : required)
        ? !isEmpty(ctx.value)
        : true,
    message: `${displayName} is required.`,
  };
}

// --- Refinement rule factories ------------------------------------------------
// Each is value-present-only: it returns true (valid) when isEmpty(ctx.value), so an
// empty value passes — presence is governed solely by required (above).

export function minLengthRule(min: number, name: string): ValidationRule {
  return {
    validate: (ctx) => isEmpty(ctx.value) || String(ctx.value).length >= min,
    message: `${name} must be at least ${min} characters.`,
  };
}
export function maxLengthRule(max: number, name: string): ValidationRule {
  return {
    validate: (ctx) => isEmpty(ctx.value) || String(ctx.value).length <= max,
    message: `${name} must be at most ${max} characters.`,
  };
}
export function minRule(min: number, name: string): ValidationRule {
  return {
    validate: (ctx) => isEmpty(ctx.value) || Number(ctx.value) >= min,
    message: `${name} must be at least ${min}.`,
  };
}
export function maxRule(max: number, name: string): ValidationRule {
  return {
    validate: (ctx) => isEmpty(ctx.value) || Number(ctx.value) <= max,
    message: `${name} must be at most ${max}.`,
  };
}
export function dateMinRule(minIso: string, name: string): ValidationRule {
  return {
    validate: (ctx) =>
      isEmpty(ctx.value) ||
      new Date(ctx.value as string | number | Date).getTime() >=
        new Date(minIso).getTime(),
    message: `${name} must be on or after ${minIso.slice(0, 10)}.`,
  };
}
export function dateMaxRule(maxIso: string, name: string): ValidationRule {
  return {
    validate: (ctx) =>
      isEmpty(ctx.value) ||
      new Date(ctx.value as string | number | Date).getTime() <=
        new Date(maxIso).getTime(),
    message: `${name} must be on or before ${maxIso.slice(0, 10)}.`,
  };
}
export function choiceMembershipRule(
  choices: readonly unknown[],
  keyOf: (o: unknown) => unknown,
  multi: boolean,
  name: string,
): ValidationRule {
  const inChoices = (v: unknown): boolean =>
    choices.some((c) => keyOf(c) === keyOf(v));
  return {
    validate: (ctx) =>
      isEmpty(ctx.value) ||
      (multi
        ? Array.isArray(ctx.value) && ctx.value.every(inChoices)
        : inChoices(ctx.value)),
    message: `${name} must be one of the available options.`,
  };
}
