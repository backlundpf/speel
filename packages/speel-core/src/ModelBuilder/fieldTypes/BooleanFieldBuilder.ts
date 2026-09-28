import { FieldBuilderBase } from "./FieldBuilderBase.js";
import type { FieldConfig } from "../../Metadata/FieldConfig.js";
import type { BooleanFieldOptions } from "./FieldOptions.js";
import { recordField, type DecoratedValue } from "../decorators.js";
import type { PropertyBuilder } from "../PropertyBuilder.js";

export class BooleanFieldBuilder extends FieldBuilderBase<BooleanFieldBuilder> {
  constructor(opts?: BooleanFieldOptions) {
    super(opts as Record<string, unknown>);
  }
  protected self(): BooleanFieldBuilder {
    return this;
  }
  protected emitConfig(): FieldConfig {
    return { kind: "Boolean" };
  }
}

/** Field decorator declaring a boolean property. */
export function BooleanField(opts?: BooleanFieldOptions) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<boolean>>,
  ): void =>
    recordField(ctx, (eb) => {
      (eb.property(ctx.name as string) as PropertyBuilder<unknown>).isBoolean(
        opts,
      );
    });
}
