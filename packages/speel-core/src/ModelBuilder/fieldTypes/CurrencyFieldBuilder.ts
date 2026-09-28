import { FieldBuilderBase } from "./FieldBuilderBase.js";
import type { FieldConfig } from "../../Metadata/FieldConfig.js";
import type { CurrencyFieldOptions } from "./FieldOptions.js";
import { recordField, type DecoratedValue } from "../decorators.js";
import type { PropertyBuilder } from "../PropertyBuilder.js";

export class CurrencyFieldBuilder extends FieldBuilderBase<CurrencyFieldBuilder> {
  constructor(opts?: CurrencyFieldOptions) {
    super(opts as Record<string, unknown>);
  }
  protected self(): CurrencyFieldBuilder {
    return this;
  }
  protected emitConfig(): FieldConfig {
    return { kind: "Currency", decimalPlaces: 2, ...this.config };
  }

  hasCurrencyCode(code: string): this {
    this.config.currencyCode = code;
    return this;
  }
  hasMin(n: number): this {
    this.config.min = n;
    return this;
  }
  hasMax(n: number): this {
    this.config.max = n;
    return this;
  }
  hasDecimalPlaces(d: number): this {
    this.config.decimalPlaces = d;
    return this;
  }
}

/** Field decorator declaring a currency property. */
export function CurrencyField(opts?: CurrencyFieldOptions) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<number>>,
  ): void =>
    recordField(ctx, (eb) => {
      (eb.property(ctx.name as string) as PropertyBuilder<unknown>).isCurrency(
        opts,
      );
    });
}
