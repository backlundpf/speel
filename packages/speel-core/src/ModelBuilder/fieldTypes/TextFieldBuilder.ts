import { FieldBuilderBase } from "./FieldBuilderBase.js";
import type { FieldConfig } from "../../Metadata/FieldConfig.js";
import type { TextFieldOptions, NoteFieldOptions } from "./FieldOptions.js";
import { recordField, type DecoratedValue } from "../decorators.js";
import type { PropertyBuilder } from "../PropertyBuilder.js";

/**
 * One builder for single-line `Text` and multi-line `Note`, distinguished by the
 * `multiline` flag in `config`. `PropertyBuilder.isNote()` is a thin wrapper that sets
 * `multiline: true` — exactly parallel to `isChoice()`/`isMultiChoice()`.
 */
export class TextFieldBuilder extends FieldBuilderBase<TextFieldBuilder> {
  constructor(opts?: Record<string, unknown>) {
    super(opts);
  }
  protected self(): TextFieldBuilder {
    return this;
  }

  protected emitConfig(): FieldConfig {
    const multiline = this.config.multiline === true;
    if (multiline) {
      return {
        kind: "Text",
        richText: false,
        appendOnly: false,
        numberOfLines: 6,
        ...this.config,
        multiline: true,
      };
    }
    // SharePoint single-line text caps MaxLength at 1–255. The fluent hasMaxLength()
    // clamps, but the decorator opts bag ({ maxLength }) writes config directly and
    // bypasses it — clamp here at the single chokepoint so neither path can emit an
    // out-of-range value that 400s ("ArgumentOutOfRangeException") at provisioning.
    const raw =
      typeof this.config.maxLength === "number" ? this.config.maxLength : 255;
    const maxLength = Math.max(1, Math.min(255, Math.floor(raw)));
    return { kind: "Text", ...this.config, maxLength, multiline: false };
  }

  asMultiline(value = true): this {
    this.config.multiline = value;
    return this;
  }
  hasMaxLength(chars: number): this {
    // Stored raw; emitConfig is the single chokepoint that clamps to 1–255.
    this.config.maxLength = chars;
    return this;
  }
  hasMinLength(chars: number): this {
    this.config.minLength = Math.max(0, Math.floor(chars));
    return this;
  }
  asRichText(value = true): this {
    this.config.richText = value;
    return this;
  }
  asAppendOnly(value = true): this {
    this.config.appendOnly = value;
    return this;
  }
  hasLines(n: number): this {
    this.config.numberOfLines = n;
    return this;
  }
}

/** Field decorator declaring a single-line (or `multiline: true`) text property. */
export function TextField(opts?: TextFieldOptions) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<string>>,
  ): void =>
    recordField(ctx, (eb) => {
      (eb.property(ctx.name as string) as PropertyBuilder<unknown>).isText(
        opts,
      );
    });
}

/** Field decorator declaring a multi-line text (Note) property — shorthand for multiline TextField. */
export function NoteField(opts?: NoteFieldOptions) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<string>>,
  ): void =>
    recordField(ctx, (eb) => {
      (eb.property(ctx.name as string) as PropertyBuilder<unknown>).isNote(
        opts,
      );
    });
}
