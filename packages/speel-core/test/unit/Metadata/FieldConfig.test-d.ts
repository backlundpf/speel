import { describe, it, expectTypeOf } from "vitest";
import type {
  FieldConfig,
  SpFieldType,
} from "../../../src/Metadata/FieldConfig.js";

describe("FieldConfig discriminated union", () => {
  it("SpFieldType is exactly the set of kinds", () => {
    // 'Note' is gone — Text absorbs it via `multiline`.
    expectTypeOf<SpFieldType>().toEqualTypeOf<
      | "Text"
      | "Number"
      | "Currency"
      | "Boolean"
      | "DateTime"
      | "Choice"
      | "Lookup"
      | "Json"
    >();
  });

  it("a Text config narrows to its variant; multiline is required", () => {
    const single = {
      kind: "Text",
      multiline: false,
      maxLength: 80,
    } satisfies FieldConfig;
    // After narrowing, multiline is the literal `false` — widened to boolean it's assignable
    if (single.kind === "Text")
      expectTypeOf(single.multiline).toEqualTypeOf<false>();
    const note = {
      kind: "Text",
      multiline: true,
      richText: true,
      appendOnly: false,
      numberOfLines: 6,
    } satisfies FieldConfig;
    void note;
    // @ts-expect-error — Text requires the `multiline` discriminator
    const _bad = { kind: "Text", maxLength: 1 } satisfies FieldConfig;
  });
});
