import { describe, it, expect } from "vitest";
import { TextFieldBuilder } from "../../../src/ModelBuilder/fieldTypes/TextFieldBuilder.js";
import { buildValidations } from "../../../src/Metadata/buildValidations.js";
import type { FieldConfig } from "../../../src/Metadata/FieldConfig.js";
import type { FieldContext } from "../../../src/types.js";

const asText = (c: FieldConfig) => c as Extract<FieldConfig, { kind: "Text" }>;
const ctx = (value: unknown): FieldContext => ({
  values: {},
  value,
  mode: "edit",
});

describe("TextFieldBuilder", () => {
  it("builds a Text property with default max length 255", () => {
    const p = new TextFieldBuilder().build("Title", false);
    expect(p.config.kind).toBe("Text");
    expect(p.config.kind === "Text" && p.config.multiline).toBe(false);
    expect(asText(p.config).maxLength).toBe(255);
  });

  it("hasMaxLength clamps to 1..255", () => {
    expect(
      asText(new TextFieldBuilder().hasMaxLength(0).build("X", false).config)
        .maxLength,
    ).toBe(1);
    expect(
      asText(new TextFieldBuilder().hasMaxLength(99).build("X", false).config)
        .maxLength,
    ).toBe(99);
    expect(
      asText(new TextFieldBuilder().hasMaxLength(500).build("X", false).config)
        .maxLength,
    ).toBe(255);
  });

  it("clamps maxLength from the opts bag too (decorator path bypasses hasMaxLength)", () => {
    // @TextField({ maxLength: 500 }) routes the raw value into config, skipping the
    // fluent hasMaxLength() clamp; emitConfig is the chokepoint that must still cap it.
    expect(
      asText(new TextFieldBuilder({ maxLength: 500 }).build("X", false).config)
        .maxLength,
    ).toBe(255);
    expect(
      asText(new TextFieldBuilder({ maxLength: 0 }).build("X", false).config)
        .maxLength,
    ).toBe(1);
    expect(
      asText(new TextFieldBuilder({ maxLength: 99 }).build("X", false).config)
        .maxLength,
    ).toBe(99);
  });
});

describe("TextFieldBuilder length refinements (composed on demand)", () => {
  it("hasMinLength records config.minLength and emits a min-length rule", () => {
    const p = new TextFieldBuilder().hasMinLength(3).build("Title", false);
    expect(asText(p.config).minLength).toBe(3);
    expect(
      buildValidations(p).some(
        (r) =>
          !r.validate(ctx("ab")) && r.message.includes("at least 3 characters"),
      ),
    ).toBe(true);
  });

  it("hasMaxLength (explicit) emits a max-length rule", () => {
    const p = new TextFieldBuilder().hasMaxLength(5).build("Title", false);
    expect(asText(p.config).maxLength).toBe(5);
    expect(buildValidations(p).some((r) => !r.validate(ctx("abcdef")))).toBe(
      true,
    );
  });

  it("default maxLength (255) now emits a max-length rule (config is the source of truth)", () => {
    const p = new TextFieldBuilder().build("Title", false);
    expect(asText(p.config).maxLength).toBe(255);
    expect(
      buildValidations(p).some((r) => !r.validate(ctx("x".repeat(300)))),
    ).toBe(true);
    expect(
      buildValidations(p).every((r) => r.validate(ctx("within limit"))),
    ).toBe(true);
  });
});

describe("Note (multiline TextFieldBuilder)", () => {
  it("builds a Note property with default options", () => {
    const p = new TextFieldBuilder().asMultiline().build("Body", false);
    expect(p.config.kind).toBe("Text");
    expect(p.config).toMatchObject({
      kind: "Text",
      multiline: true,
      richText: false,
      appendOnly: false,
      numberOfLines: 6,
    });
  });

  it("asRichText / asAppendOnly / hasLines set options fluently", () => {
    const p = new TextFieldBuilder()
      .asMultiline()
      .asRichText()
      .asAppendOnly()
      .hasLines(10)
      .build("Body", false);
    expect(p.config).toMatchObject({
      kind: "Text",
      multiline: true,
      richText: true,
      appendOnly: true,
      numberOfLines: 10,
    });
  });
});
