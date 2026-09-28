import { expectTypeOf } from "vitest";
import {
  ChoiceField,
  MultiChoiceField,
} from "../../src/ModelBuilder/fieldTypes/ChoiceFieldBuilder.js";
import type { FieldConfig } from "../../src/Metadata/FieldConfig.js";

type Choice = Extract<FieldConfig, { kind: "Choice" }>;
type Lookup = Extract<FieldConfig, { kind: "Lookup" }>;

// Removed members are proven gone.
// @ts-expect-error — `choices` folded into `options`.
type _NoChoices = Choice["choices"];
// @ts-expect-error — `displayAs` is gone; `radioButtons` is the only rendering flag.
type _NoChoiceDisplayAs = Choice["displayAs"];
// @ts-expect-error — `displayAs` is gone from lookups too.
type _NoLookupDisplayAs = Lookup["displayAs"];
// @ts-expect-error — renamed to optionsQueryAsync.
type _NoOptionsAsync = Lookup["optionsAsync"];

expectTypeOf<Choice["radioButtons"]>().toEqualTypeOf<boolean>();

class E {
  // A literal list still types the property.
  @ChoiceField({ options: ["Planning", "Active"] })
  s1: "Planning" | "Active" | null = null;

  // @ts-expect-error — a list member outside the property's union is refused.
  @ChoiceField({ options: ["Planning", "Bogus"] })
  s2: "Planning" | "Active" | null = null;

  // A thunk is checked against the property, not inferred from its own return.
  @ChoiceField({ options: async () => ["Planning" as const] })
  s3: "Planning" | "Active" | null = null;

  // @ts-expect-error — a thunk returning a value outside the union is refused.
  @ChoiceField({ options: async () => ["Bogus" as const] })
  s4: "Planning" | "Active" | null = null;

  // The thunk receives a context with the DbContext.
  @ChoiceField({
    options: ({ db }) => {
      expectTypeOf(db).not.toBeAny();
      return ["a"];
    },
  })
  s5: string | null = null;

  @MultiChoiceField({ options: ["x", "y"] })
  s6: ("x" | "y")[] | null = null;
}
void E;
