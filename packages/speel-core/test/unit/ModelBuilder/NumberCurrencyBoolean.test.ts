import { describe, it, expect } from "vitest";
import { NumberFieldBuilder } from "../../../src/ModelBuilder/fieldTypes/NumberFieldBuilder.js";
import { CurrencyFieldBuilder } from "../../../src/ModelBuilder/fieldTypes/CurrencyFieldBuilder.js";
import { BooleanFieldBuilder } from "../../../src/ModelBuilder/fieldTypes/BooleanFieldBuilder.js";
import { buildValidations } from "../../../src/Metadata/buildValidations.js";
import type { FieldConfig } from "../../../src/Metadata/FieldConfig.js";
import type { FieldContext } from "../../../src/types.js";

const asNumber = (c: FieldConfig) =>
  c as Extract<FieldConfig, { kind: "Number" }>;
const asCurrency = (c: FieldConfig) =>
  c as Extract<FieldConfig, { kind: "Currency" }>;
const ctx = (value: unknown): FieldContext => ({
  values: {},
  value,
  mode: "edit",
});

describe("NumberFieldBuilder", () => {
  it("chains and builds with all refinements", () => {
    const p = new NumberFieldBuilder()
      .hasMin(0)
      .hasMax(100)
      .hasDecimalPlaces(2)
      .showAsPercentage()
      .build("X", false);
    expect(p.config.kind).toBe("Number");
    expect(asNumber(p.config)).toMatchObject({
      min: 0,
      max: 100,
      decimalPlaces: 2,
      showAsPercentage: true,
    });
  });

  it("hasDecimalPlaces accepts auto", () => {
    const p = new NumberFieldBuilder()
      .hasDecimalPlaces("auto")
      .build("X", false);
    expect(asNumber(p.config).decimalPlaces).toBe("auto");
  });
});

describe("CurrencyFieldBuilder", () => {
  it("defaults decimalPlaces to 2 and captures currencyCode", () => {
    const p = new CurrencyFieldBuilder()
      .hasCurrencyCode("USD")
      .build("Price", false);
    expect(p.config.kind).toBe("Currency");
    expect(asCurrency(p.config)).toMatchObject({
      currencyCode: "USD",
      decimalPlaces: 2,
    });
  });

  it("refinements stick", () => {
    const p = new CurrencyFieldBuilder()
      .hasMin(0)
      .hasMax(1000)
      .hasDecimalPlaces(4)
      .build("Price", false);
    expect(asCurrency(p.config)).toMatchObject({
      min: 0,
      max: 1000,
      decimalPlaces: 4,
    });
  });
});

describe("BooleanFieldBuilder", () => {
  it("builds a Boolean property", () => {
    const p = new BooleanFieldBuilder()
      .isRequired()
      .hasDefaultValue(false)
      .build("IsActive", false);
    expect(p.config.kind).toBe("Boolean");
    expect(p.required).toBe(true);
    expect(p.defaultValue).toBe(false);
  });
});

describe("numeric range refinements (composed on demand)", () => {
  it("Number hasMin/hasMax emit bound rules (0 is present)", () => {
    const p = new NumberFieldBuilder().hasMin(1).hasMax(10).build("N", false);
    expect(buildValidations(p).some((r) => !r.validate(ctx(0)))).toBe(true); // below min
    expect(buildValidations(p).some((r) => !r.validate(ctx(11)))).toBe(true); // above max
    expect(buildValidations(p).every((r) => r.validate(ctx(5)))).toBe(true);
    expect(buildValidations(p).every((r) => r.validate(ctx(null)))).toBe(true);
  });
  it("Currency hasMin/hasMax emit bound rules", () => {
    const p = new CurrencyFieldBuilder()
      .hasMin(0)
      .hasMax(100)
      .build("Price", false);
    expect(buildValidations(p).some((r) => !r.validate(ctx(-1)))).toBe(true);
    expect(buildValidations(p).every((r) => r.validate(ctx(50)))).toBe(true);
  });
});
