import { describe, it, expect } from "vitest";
import { TextFieldBuilder } from "../../src/ModelBuilder/fieldTypes/TextFieldBuilder.js";
import { buildValidations } from "../../src/Metadata/buildValidations.js";
import type { FieldContext } from "../../src/types.js";

const ctx = (value: unknown): FieldContext => ({
  values: {},
  value,
  mode: "edit",
});

describe("builders store only custom validations; buildValidations derives the rest", () => {
  it("Text builder stores config (min/max) but NOT desugared refinement rules", () => {
    const p = new TextFieldBuilder()
      .hasMinLength(3)
      .hasMaxLength(5)
      .isRequired()
      .hasValidation((c: FieldContext) => c.value !== "bad", "no bad")
      .build("Title", false);

    // Property carries only the custom rule.
    expect(p.customValidations).toHaveLength(1);
    expect(p.customValidations[0].message).toBe("no bad");

    // The full set is composed on demand: required + minLength + maxLength + custom.
    const full = buildValidations(p);
    expect(full).toHaveLength(4);
    expect(full.some((r) => !r.validate(ctx("")))).toBe(true); // required
    expect(full.some((r) => !r.validate(ctx("ab")))).toBe(true); // minLength
  });
});
