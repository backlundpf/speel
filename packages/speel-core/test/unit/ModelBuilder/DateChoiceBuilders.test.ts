import { describe, it, expect } from "vitest";
import { DateTimeFieldBuilder } from "../../../src/ModelBuilder/fieldTypes/DateTimeFieldBuilder.js";
import { ChoiceFieldBuilder } from "../../../src/ModelBuilder/fieldTypes/ChoiceFieldBuilder.js";
import { buildValidations } from "../../../src/Metadata/buildValidations.js";
import { ModelConfigurationException } from "../../../src/errors.js";
import type { FieldConfig } from "../../../src/Metadata/FieldConfig.js";
import type { FieldContext } from "../../../src/types.js";

const asDate = (c: FieldConfig) =>
  c as Extract<FieldConfig, { kind: "DateTime" }>;
const asChoice = (c: FieldConfig) =>
  c as Extract<FieldConfig, { kind: "Choice" }>;
const ctx = (value: unknown): FieldContext => ({
  values: {},
  value,
  mode: "edit",
});

describe("DateTimeFieldBuilder", () => {
  it("builds with default options", () => {
    const p = new DateTimeFieldBuilder().build("PublishedAt", false);
    expect(p.config.kind).toBe("DateTime");
    expect(asDate(p.config)).toEqual({
      kind: "DateTime",
      displayFormat: "DateTime",
      friendlyFormat: "Disabled",
    });
  });

  it("asDateOnly / asRelativeFriendly / hasMin / hasMax set options fluently", () => {
    const mn = new Date("2026-01-01T00:00:00Z");
    const mx = new Date("2026-12-31T00:00:00Z");
    const p = new DateTimeFieldBuilder()
      .asDateOnly()
      .asRelativeFriendly()
      .hasMin(mn)
      .hasMax(mx)
      .build("D", false);
    expect(asDate(p.config)).toEqual({
      kind: "DateTime",
      displayFormat: "DateOnly",
      friendlyFormat: "Relative",
      min: mn.toISOString(),
      max: mx.toISOString(),
    });
  });
});

describe("ChoiceFieldBuilder (merged single + multi)", () => {
  it("single choice builds a Choice column with options and defaults", () => {
    const p = new ChoiceFieldBuilder<string>()
      .hasOptions(["A", "B", "C"])
      .build("Status", false);
    expect(p.config.kind).toBe("Choice");
    expect(asChoice(p.config)).toEqual({
      kind: "Choice",
      multi: false,
      options: ["A", "B", "C"],
      fillIn: false,
      radioButtons: false,
    });
  });

  it("asMultiChoice() builds a MultiChoice column", () => {
    const p = new ChoiceFieldBuilder<string[]>()
      .asMultiChoice()
      .hasOptions(["A", "B"])
      .allowFillIn()
      .build("Tags", false);
    expect(p.config.kind).toBe("Choice");
    expect(asChoice(p.config)).toEqual({
      kind: "Choice",
      multi: true,
      options: ["A", "B"],
      fillIn: true,
      radioButtons: false,
    });
  });

  it("asRadioButtons sets radioButtons", () => {
    const p = new ChoiceFieldBuilder<string>()
      .hasOptions(["A"])
      .asRadioButtons()
      .build("Status", false);
    expect(asChoice(p.config)).toMatchObject({ radioButtons: true });
  });

  it("throws at build() when hasOptions was never called", () => {
    expect(() =>
      new ChoiceFieldBuilder<string>().build("Status", false),
    ).toThrow(ModelConfigurationException);
  });
});

describe("DateTime range refinements (composed on demand)", () => {
  it("hasMin/hasMax emit date-range rules", () => {
    const p = new DateTimeFieldBuilder()
      .hasMin(new Date("2026-01-01T00:00:00Z"))
      .hasMax(new Date("2026-12-31T00:00:00Z"))
      .build("Due", false);
    expect(
      buildValidations(p).some(
        (r) => !r.validate(ctx(new Date("2025-06-01T00:00:00Z"))),
      ),
    ).toBe(true);
    expect(
      buildValidations(p).some(
        (r) => !r.validate(ctx(new Date("2027-06-01T00:00:00Z"))),
      ),
    ).toBe(true);
    expect(
      buildValidations(p).every((r) =>
        r.validate(ctx(new Date("2026-06-01T00:00:00Z"))),
      ),
    ).toBe(true);
    expect(buildValidations(p).every((r) => r.validate(ctx(null)))).toBe(true);
  });
});

describe("Choice membership rule (composed on demand)", () => {
  it("value must be one of the options when fill-in is off", () => {
    const p = new ChoiceFieldBuilder<string>()
      .hasOptions(["Open", "Closed"])
      .build("Status", false);
    expect(buildValidations(p).some((r) => !r.validate(ctx("Nope")))).toBe(
      true,
    );
    expect(buildValidations(p).every((r) => r.validate(ctx("Open")))).toBe(
      true,
    );
    expect(buildValidations(p).every((r) => r.validate(ctx("")))).toBe(true); // empty governed by isRequired
  });
  it("no membership rule when allowFillIn is on", () => {
    const p = new ChoiceFieldBuilder<string>()
      .hasOptions(["Open"])
      .allowFillIn()
      .build("Status", false);
    expect(buildValidations(p).every((r) => r.validate(ctx("Anything")))).toBe(
      true,
    );
  });
  it("object-valued choices match via optionsValue", () => {
    const opts = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
    const p = new ChoiceFieldBuilder<{ id: string; label: string }>()
      .hasOptions(opts)
      .hasOptionsValue((o) => o.id)
      .build("Cat", false);
    expect(
      buildValidations(p).every((r) =>
        r.validate(ctx({ id: "a", label: "A" })),
      ),
    ).toBe(true);
    expect(
      buildValidations(p).some(
        (r) => !r.validate(ctx({ id: "z", label: "Z" })),
      ),
    ).toBe(true);
  });
  it("multi-choice validates every element", () => {
    const p = new ChoiceFieldBuilder<string[]>()
      .hasOptions(["a", "b", "c"])
      .asMultiChoice()
      .build("Tags", false);
    expect(buildValidations(p).every((r) => r.validate(ctx(["a", "c"])))).toBe(
      true,
    );
    expect(buildValidations(p).some((r) => !r.validate(ctx(["a", "z"])))).toBe(
      true,
    );
    expect(buildValidations(p).every((r) => r.validate(ctx([])))).toBe(true); // empty governed by isRequired
  });
});
