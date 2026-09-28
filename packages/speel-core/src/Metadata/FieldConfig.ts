import type { EntityType } from "./EntityType.js";
import type {
  ChoiceOptionsLoader,
  OptionsCreator,
  OptionsLoader,
  OptionsThunk,
} from "./optionsLoader.js";

export type TextFieldConfig = {
  multiline: boolean; // false → SP "Text" (single-line); true → SP "Note"
  maxLength?: number;
  minLength?: number;
  richText?: boolean; // multiline-only
  appendOnly?: boolean; // multiline-only
  numberOfLines?: number; // multiline-only
};

export type NumberFieldConfig = {
  min?: number;
  max?: number;
  decimalPlaces?: number | "auto";
  showAsPercentage?: boolean;
};

export type CurrencyFieldConfig = {
  currencyCode?: string;
  min?: number;
  max?: number;
  decimalPlaces: number;
};

export type DateTimeFieldConfig = {
  displayFormat: "DateOnly" | "DateTime";
  friendlyFormat: "Disabled" | "Relative";
  min?: string;
  max?: string;
};

/**
 * The options surface a Choice and a Lookup share. Only the server-side loader's
 * shape differs by kind: a lookup's gets the target's `set`, a Choice has no target.
 *
 * Supplying `options` means that set, evaluated once per field instance and searched
 * client-side. Supplying `optionsQueryAsync` means that query, per term, server-side.
 * Neither (lookups only) means load the target's rows once and search client-side.
 */
export type SelectionOptions<TLoader> = {
  /**
   * The set to choose from. A thunk so a model can declare a lazy source without
   * querying at construction time, and so a DECORATED model can reach the context
   * at all — a fluent model closes over `this` in onModelCreating, a decorator on
   * an entity class has nothing to close over. Evaluated once per field instance.
   */
  options?: readonly unknown[] | OptionsThunk;
  /**
   * Server-side: run per search term. Replaces the default load entirely. `set` is
   * the target's set, so it is present for a Lookup and absent for a Choice, which
   * has no target — use `db` there.
   */
  optionsQueryAsync?: TLoader;
  /**
   * Client-side SEARCH: which of the options in hand match what was typed.
   * Default: case-insensitive substring over each option's rendered text.
   */
  optionsQuery?: (
    query: string,
    options: readonly unknown[],
  ) => readonly unknown[];
  /**
   * Client-side AVAILABILITY: may this option be selected at all, given the entity's
   * state. Not the search — filter = may this be chosen; query = does this match what
   * was typed. Availability applies first, so the search only sees selectable options.
   */
  optionsFilter?: (ctx: import("../types.js").OptionContext) => boolean;
  /** An option's key in the picker. */
  optionsValue?: (o: unknown) => unknown;
  /** How one option renders in the picker. */
  optionsRender?: (o: unknown) => unknown;
};

export type ChoiceFieldConfig = {
  multi: boolean;
  fillIn: boolean;
  /** The only rendering opt-in: a radio group instead of the combobox. */
  radioButtons: boolean;
} & SelectionOptions<ChoiceOptionsLoader>;

/** A lookup; a person column is one whose `target.source.kind === "provider"`. */
export type LookupFieldConfig = {
  target: EntityType;
  displayField: string;
  multi: boolean;
  /**
   * How to create the target row when the typed text matches nothing. Lookup-only: a
   * Choice's creation is `fillIn`, and there is nothing to persist.
   */
  optionsCreateAsync?: OptionsCreator;
} & SelectionOptions<OptionsLoader>;

/**
 * A complex value stored as speel's JSON in a Note column. `shape` is the embedded
 * EntityType describing it; `multi` says whether the column holds one or an array.
 *
 * `shape` is resolved by ModelBuilder.build() once every EntityType exists — the same
 * late resolution a Lookup's `target` gets, and the reason this config is not frozen.
 */
export interface JsonFieldConfig {
  shape: EntityType;
  multi: boolean;
}

/** Per-field-type metadata. `kind` is the SharePoint field type and the sole discriminant. */
export type FieldConfig =
  | ({ kind: "Text" } & TextFieldConfig)
  | ({ kind: "Number" } & NumberFieldConfig)
  | ({ kind: "Currency" } & CurrencyFieldConfig)
  | { kind: "Boolean" }
  | ({ kind: "DateTime" } & DateTimeFieldConfig)
  | ({ kind: "Choice" } & ChoiceFieldConfig)
  | ({ kind: "Lookup" } & LookupFieldConfig)
  | ({ kind: "Json" } & JsonFieldConfig);

/** The set of field types — derived so it can never drift from FieldConfig. */
export type SpFieldType = FieldConfig["kind"];
