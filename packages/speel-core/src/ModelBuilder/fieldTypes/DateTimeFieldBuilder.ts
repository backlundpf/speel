import { FieldBuilderBase } from "./FieldBuilderBase.js";
import type { FieldConfig } from "../../Metadata/FieldConfig.js";
import type { DateTimeFieldOptions } from "./FieldOptions.js";
import { recordField, type DecoratedValue } from "../decorators.js";
import type { PropertyBuilder } from "../PropertyBuilder.js";

export class DateTimeFieldBuilder extends FieldBuilderBase<DateTimeFieldBuilder> {
  // min/max are ISO strings on the config; options accept Dates, normalized before routing.
  constructor(opts?: DateTimeFieldOptions) {
    super({
      ...opts,
      ...(opts?.min ? { min: opts.min.toISOString() } : {}),
      ...(opts?.max ? { max: opts.max.toISOString() } : {}),
    } as Record<string, unknown>);
  }
  protected self(): DateTimeFieldBuilder {
    return this;
  }
  protected emitConfig(): FieldConfig {
    return {
      kind: "DateTime",
      displayFormat: "DateTime",
      friendlyFormat: "Disabled",
      ...this.config,
    };
  }

  asDateOnly(): this {
    this.config.displayFormat = "DateOnly";
    return this;
  }
  asDateTime(): this {
    this.config.displayFormat = "DateTime";
    return this;
  }
  asRelativeFriendly(): this {
    this.config.friendlyFormat = "Relative";
    return this;
  }
  asDisabledFriendly(): this {
    this.config.friendlyFormat = "Disabled";
    return this;
  }
  hasMin(d: Date): this {
    this.config.min = d.toISOString();
    return this;
  }
  hasMax(d: Date): this {
    this.config.max = d.toISOString();
    return this;
  }
}

/** Field decorator declaring a date/time property. */
export function DateTimeField(opts?: DateTimeFieldOptions) {
  return (
    _t: unknown,
    ctx: ClassFieldDecoratorContext<unknown, DecoratedValue<Date>>,
  ): void =>
    recordField(ctx, (eb) => {
      (eb.property(ctx.name as string) as PropertyBuilder<unknown>).isDateTime(
        opts,
      );
    });
}
