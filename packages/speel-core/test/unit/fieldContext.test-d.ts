import { expectTypeOf } from "vitest";
import type {
  FieldContext,
  OptionContext,
  FieldStateFn,
  FormMode,
} from "../../src/types.js";

// FieldContext threads value-bag and field-value types.
type Ctx = FieldContext<{ Status: string }, string>;
expectTypeOf<Ctx["values"]>().toEqualTypeOf<{ Status: string }>();
expectTypeOf<Ctx["value"]>().toEqualTypeOf<string>();
expectTypeOf<Ctx["mode"]>().toEqualTypeOf<FormMode>();

// OptionContext adds `option`.
expectTypeOf<OptionContext<{ Status: string }>>().toMatchTypeOf<
  FieldContext<{ Status: string }>
>();
expectTypeOf<OptionContext["option"]>().toEqualTypeOf<unknown>();

// FieldStateFn now takes a FieldContext.
const fn: FieldStateFn<{ Status: string }> = (ctx) =>
  ctx.values.Status === "Open";
expectTypeOf(fn).parameter(0).toMatchTypeOf<FieldContext<{ Status: string }>>();
