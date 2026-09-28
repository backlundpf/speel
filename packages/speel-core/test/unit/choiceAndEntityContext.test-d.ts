import { expectTypeOf } from "vitest";
import type { OptionContext } from "../../src/types.js";
import type { FieldConfig } from "../../src/Metadata/FieldConfig.js";
import type { ChoiceFieldOptions } from "../../src/ModelBuilder/fieldTypes/FieldOptions.js";

// Choice/MultiChoice share one union member, so extract by the full kind union.
type ChoiceCfg = Extract<FieldConfig, { kind: "Choice" }>;

// optionsFilter takes OptionContext — one name shared with the navigation option key.
expectTypeOf<NonNullable<ChoiceCfg["optionsFilter"]>>()
  .parameter(0)
  .toMatchTypeOf<OptionContext>();
// The authoring bag's predicate is entity-typed, so `c.values.Foo` is reachable.
expectTypeOf<NonNullable<ChoiceFieldOptions<string>["optionsFilter"]>>()
  .parameter(0)
  .toMatchTypeOf<OptionContext<{ Anything: string }>>();
// option projections stay unary
expectTypeOf<NonNullable<ChoiceCfg["optionsValue"]>>()
  .parameter(0)
  .toEqualTypeOf<unknown>();
