import { FieldBuilderBase } from "./FieldBuilderBase.js";
import type { FieldConfig } from "../../Metadata/FieldConfig.js";
import type { NumberFieldOptions } from "./FieldOptions.js";
import { recordField, type DecoratedValue } from "../decorators.js";
import type { PropertyBuilder } from "../PropertyBuilder.js";

export class NumberFieldBuilder extends FieldBuilderBase<NumberFieldBuilder> {
  constructor(opts?: NumberFieldOptions) {
    super(opts as Record<string, unknown>);
  }
  protected self(): NumberFieldBuilder {
    return this;
  }
  protected emitConfig(): FieldConfig {
    return { kind: "Number", ...this.config };
  }

  hasMin(n: number): this {
    this.config.min = n;
    return this;
  }
  hasMax(n: number): this {
    this.config.max = n;
    return this;
  }
  hasDecimalPlaces(d: number | "auto"): this {
    this.config.decimalPlaces = d;
    return this;
  }
  showAsPercentage(value = true): this {
    this.config.showAsPercentage = value;
    return this;
  }
}

/** Field decorator declaring a number property. */
export function NumberField(opts?: NumberFieldOptions) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<number>>,
  ): void =>
    recordField(ctx, (eb) => {
      (eb.property(ctx.name as string) as PropertyBuilder<unknown>).isNumber(
        opts,
      );
    });
}
