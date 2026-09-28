import { TextFieldBuilder } from "./fieldTypes/TextFieldBuilder.js";
import type {
  TextFieldOptions,
  NoteFieldOptions,
  NumberFieldOptions,
  CurrencyFieldOptions,
  BooleanFieldOptions,
  DateTimeFieldOptions,
  ChoiceFieldOptions,
} from "./fieldTypes/FieldOptions.js";
import { NumberFieldBuilder } from "./fieldTypes/NumberFieldBuilder.js";
import { CurrencyFieldBuilder } from "./fieldTypes/CurrencyFieldBuilder.js";
import { BooleanFieldBuilder } from "./fieldTypes/BooleanFieldBuilder.js";
import { DateTimeFieldBuilder } from "./fieldTypes/DateTimeFieldBuilder.js";
import { ChoiceFieldBuilder } from "./fieldTypes/ChoiceFieldBuilder.js";
import { JsonFieldBuilder } from "./fieldTypes/JsonFieldBuilder.js";
import type { JsonFieldOptions } from "./fieldTypes/FieldOptions.js";
import { FieldBuilderBase } from "./fieldTypes/FieldBuilderBase.js";
import type { Property } from "../Metadata/Property.js";
import { ModelConfigurationException } from "../errors.js";
import type { EntityCtor, IEntity } from "../types.js";
import type { IFieldBuilder } from "./types.js";

// Per-type method bags — the visible surface for a given property value type.
interface StringFieldMethods {
  isText(opts?: TextFieldOptions): TextFieldBuilder;
  isNote(opts?: NoteFieldOptions): TextFieldBuilder;
  isChoice(opts?: ChoiceFieldOptions<string>): ChoiceFieldBuilder<string>;
}
interface NumberFieldMethods {
  isNumber(opts?: NumberFieldOptions): NumberFieldBuilder;
  isCurrency(opts?: CurrencyFieldOptions): CurrencyFieldBuilder;
}
interface BooleanFieldMethods {
  isBoolean(opts?: BooleanFieldOptions): BooleanFieldBuilder;
}
interface DateFieldMethods {
  isDateTime(opts?: DateTimeFieldOptions): DateTimeFieldBuilder;
}
interface StringArrayChoiceMethods {
  isMultiChoice(
    opts?: ChoiceFieldOptions<string>,
  ): ChoiceFieldBuilder<string[]>;
}
interface ObjectChoiceMethods<TObj> {
  isChoice(opts?: ChoiceFieldOptions<TObj>): ChoiceFieldBuilder<TObj>;
}
interface ObjectArrayChoiceMethods<TObj> {
  isMultiChoice(opts?: ChoiceFieldOptions<TObj>): ChoiceFieldBuilder<TObj[]>;
}
interface ObjectJsonMethods<TObj> {
  isJson(opts: JsonFieldOptions<TObj>): JsonFieldBuilder;
}
interface ObjectArrayJsonMethods<TObj> {
  isMultiJson(opts: JsonFieldOptions<TObj>): JsonFieldBuilder;
}

/**
 * Conditional intersection: each failing branch contributes `unknown` (the identity
 * for `&`), so only the valid Is* methods exist. `NonNullable<TValue>` strips
 * undefined/null AND prevents distribution (which would re-introduce `unknown` and
 * silently restore every method). The array branch serves string[] and object[];
 * the final branch serves single object choices (excluding Date and arrays).
 */
export type PropertyBuilderFor<TValue> = (NonNullable<TValue> extends string
  ? StringFieldMethods
  : unknown) &
  (NonNullable<TValue> extends number ? NumberFieldMethods : unknown) &
  (NonNullable<TValue> extends boolean ? BooleanFieldMethods : unknown) &
  (NonNullable<TValue> extends Date ? DateFieldMethods : unknown) &
  (NonNullable<TValue> extends readonly (infer E)[]
    ? E extends string
      ? StringArrayChoiceMethods
      : E extends object
        ? ObjectArrayChoiceMethods<E> & ObjectArrayJsonMethods<E>
        : unknown
    : unknown) &
  (NonNullable<TValue> extends Date
    ? unknown
    : NonNullable<TValue> extends readonly unknown[]
      ? unknown
      : NonNullable<TValue> extends object
        ? ObjectChoiceMethods<NonNullable<TValue>> &
            ObjectJsonMethods<NonNullable<TValue>>
        : unknown);

export class PropertyBuilder<TValue> {
  public readonly propertyName: string;
  private typeBuilder: IFieldBuilder | undefined;

  constructor(propertyName: string) {
    this.propertyName = propertyName;
  }

  private set<TB extends FieldBuilderBase<TB>>(tb: TB): TB {
    if (this.typeBuilder) {
      // Re-declaring the same field type is idempotent (a property may be
      // declared by both a decorator and the fluent API); a different type is
      // a configuration error.
      if (this.typeBuilder.constructor !== tb.constructor) {
        throw new ModelConfigurationException(
          `Property '${this.propertyName}' already has a field type assigned.`,
        );
      }
      return this.typeBuilder as unknown as TB;
    }
    this.typeBuilder = tb as unknown as IFieldBuilder;
    return tb;
  }

  isText(opts?: TextFieldOptions): TextFieldBuilder {
    return this.set(new TextFieldBuilder(opts as Record<string, unknown>));
  }
  isNote(opts?: NoteFieldOptions): TextFieldBuilder {
    return this.set(
      new TextFieldBuilder({ ...(opts as object), multiline: true } as Record<
        string,
        unknown
      >),
    );
  }
  isChoice(opts?: ChoiceFieldOptions<TValue>): ChoiceFieldBuilder<TValue> {
    return this.set(
      new ChoiceFieldBuilder<TValue>(
        opts as unknown as Record<string, unknown>,
      ),
    );
  }
  isMultiChoice(
    opts?: ChoiceFieldOptions<unknown>,
  ): ChoiceFieldBuilder<TValue> {
    return this.set(
      new ChoiceFieldBuilder<TValue>(
        opts as unknown as Record<string, unknown>,
      ).asMultiChoice(),
    );
  }
  isJson(opts: JsonFieldOptions<unknown>): JsonFieldBuilder {
    return this.set(
      new JsonFieldBuilder(opts as unknown as Record<string, unknown>),
    ).ofShape(opts.of as () => EntityCtor<IEntity>);
  }
  isMultiJson(opts: JsonFieldOptions<unknown>): JsonFieldBuilder {
    return this.isJson(opts).asMulti();
  }
  isNumber(opts?: NumberFieldOptions): NumberFieldBuilder {
    return this.set(new NumberFieldBuilder(opts));
  }
  isCurrency(opts?: CurrencyFieldOptions): CurrencyFieldBuilder {
    return this.set(new CurrencyFieldBuilder(opts));
  }
  isBoolean(opts?: BooleanFieldOptions): BooleanFieldBuilder {
    return this.set(new BooleanFieldBuilder(opts));
  }
  isDateTime(opts?: DateTimeFieldOptions): DateTimeFieldBuilder {
    return this.set(new DateTimeFieldBuilder(opts));
  }

  /** @internal */
  getTypeBuilder(): IFieldBuilder | undefined {
    return this.typeBuilder;
  }
}
