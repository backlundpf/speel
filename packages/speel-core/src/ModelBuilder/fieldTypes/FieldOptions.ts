import type {
  EntityCtor,
  FieldStateFn,
  IEntity,
  OptionContext,
} from "../../types.js";
import type {
  ValidationRule,
  FieldRenderFn,
} from "../../Metadata/Validation.js";
import type { TableFilterConfig } from "../../Metadata/TableFilterConfig.js";
import type { IValueCodec } from "../../Metadata/Property.js";
import type {
  TextFieldConfig,
  NumberFieldConfig,
  CurrencyFieldConfig,
  DateTimeFieldConfig,
} from "../../Metadata/FieldConfig.js";
import type {
  ChoiceOptionsLoader,
  OptionsThunk,
} from "../../Metadata/optionsLoader.js";

// State predicates in option bags are entity-typed by the caller; the bag isn't generic
// over the entity, so `any` keeps `(c: FieldContext<MyEntity>) => boolean` ergonomic.
// The predicate is applied to the real context at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatePredicate = FieldStateFn<any>;
// Same reasoning for the choice availability predicate: `any` keeps
// `(c: OptionContext<MyEntity>) => boolean` ergonomic in the option bag.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OptionPredicate = (ctx: OptionContext<any>) => boolean;

/**
 * The shared refinement surface every field decorator accepts. The keys match
 * REFINEMENT_KEYS exactly; FieldBuilderBase routes them onto the field-state draft.
 */
export interface FieldOptions {
  displayName?: string;
  required?: boolean | StatePredicate;
  visible?: boolean | StatePredicate;
  enabled?: boolean | StatePredicate;
  readOnly?: boolean;
  indexed?: boolean;
  columnName?: string;
  description?: string;
  defaultValue?: unknown;
  render?: FieldRenderFn;
  tableFilter?: TableFilterConfig;
  validations?: ValidationRule[];
  codec?: IValueCodec;
}

// `multiline` is the discriminant: the default branch exposes single-line knobs,
// the `multiline: true` branch exposes the note-only knobs. `@NoteField` is the latter.
export type TextFieldOptions = FieldOptions &
  (
    | ({ multiline?: false } & Pick<TextFieldConfig, "maxLength" | "minLength">)
    | ({ multiline: true } & Pick<
        TextFieldConfig,
        "richText" | "appendOnly" | "numberOfLines"
      >)
  );
export type NoteFieldOptions = FieldOptions &
  Pick<TextFieldConfig, "richText" | "appendOnly" | "numberOfLines">;

export type NumberFieldOptions = FieldOptions & NumberFieldConfig;
// decimalPlaces is required on the config (defaulted by the builder) but optional as an option.
export type CurrencyFieldOptions = FieldOptions &
  Omit<CurrencyFieldConfig, "decimalPlaces"> & { decimalPlaces?: number };
export type BooleanFieldOptions = FieldOptions;
// displayFormat/friendlyFormat are defaulted by the builder (optional here); min/max are
// ISO strings on the config but accept Dates as options (the builder normalizes).
export type DateTimeFieldOptions = FieldOptions & {
  displayFormat?: DateTimeFieldConfig["displayFormat"];
  friendlyFormat?: DateTimeFieldConfig["friendlyFormat"];
  min?: Date;
  max?: Date;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChoiceLoader<T> = ChoiceOptionsLoader<any, NoInfer<T>>;

// `multi` is set by the decorator (@ChoiceField vs @MultiChoiceField), not a free option.
// `NoInfer` on the thunk and loader is load-bearing: at a decorator site `T` comes from
// the decorated property, so a literal list and a thunk are both CHECKED against it.
// Without it a thunk's own return type would narrow `T` and refuse the property.
export type ChoiceFieldOptions<T> = FieldOptions & {
  fillIn?: boolean;
  radioButtons?: boolean;
  optionsQuery?: (query: string, options: readonly T[]) => readonly T[];
  optionsValue?: (o: T) => unknown;
  optionsRender?: (o: T) => unknown;
  optionsFilter?: OptionPredicate;
} & (
    | {
        options: readonly T[] | OptionsThunk<NoInfer<T>>;
        optionsQueryAsync?: AnyChoiceLoader<T>;
      }
    | { options?: never; optionsQueryAsync: AnyChoiceLoader<T> }
  );

export type JsonFieldOptions<T> = FieldOptions & {
  /** The shape this column holds, as a thunk so it may be declared later. */
  of: () => EntityCtor<T & IEntity>;
};
