import type { FieldContext, FieldStateFn } from "../types.js";
import type { ValidationRule } from "../Metadata/Validation.js";

/** Resolve a static-or-predicate field-state value against a context. */
export function resolveState(
  v: boolean | FieldStateFn<unknown>,
  ctx: FieldContext,
): boolean {
  return typeof v === "function" ? v(ctx) : v;
}

/** Collect the messages of every rule that fails for this context. */
export function collectErrors(
  rules: readonly ValidationRule[],
  ctx: FieldContext,
): string[] {
  const out: string[] = [];
  for (const r of rules) if (!r.validate(ctx)) out.push(r.message);
  return out;
}
