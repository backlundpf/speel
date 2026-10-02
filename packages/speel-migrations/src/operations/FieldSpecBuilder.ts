import type { FieldSpec, FieldSpecBase } from "../FieldSpec.js";

interface CommonOpts {
  displayName?: string;
  description?: string;
  required?: boolean;
  indexed?: boolean;
  default?: unknown;
  /** Create the column hidden. Creation only; a hidden column skips the default view. */
  hidden?: boolean;
  /** Add the new column to the default view (default true). Creation only. */
  addToDefaultView?: boolean;
}

type CommonFields = Pick<
  FieldSpecBase,
  | "displayName"
  | "description"
  | "required"
  | "indexed"
  | "default"
  | "hidden"
  | "addToDefaultView"
>;

const common = (o: CommonOpts): Partial<CommonFields> => ({
  ...(o.displayName !== undefined ? { displayName: o.displayName } : {}),
  ...(o.description !== undefined ? { description: o.description } : {}),
  ...(o.required !== undefined ? { required: o.required } : {}),
  ...(o.indexed !== undefined ? { indexed: o.indexed } : {}),
  ...(o.default !== undefined ? { default: o.default } : {}),
  ...(o.hidden !== undefined ? { hidden: o.hidden } : {}),
  ...(o.addToDefaultView !== undefined
    ? { addToDefaultView: o.addToDefaultView }
    : {}),
});

export class FieldSpecBuilder {
  constructor(private readonly name: string) {}

  text(
    o: CommonOpts & { maxLength?: number; minLength?: number } = {},
  ): FieldSpec {
    return {
      kind: "Text",
      internalName: this.name,
      multiline: false,
      ...common(o),
      ...(o.maxLength !== undefined ? { maxLength: o.maxLength } : {}),
      ...(o.minLength !== undefined ? { minLength: o.minLength } : {}),
    };
  }
  note(
    o: CommonOpts & {
      richText?: boolean;
      appendOnly?: boolean;
      numberOfLines?: number;
    } = {},
  ): FieldSpec {
    return {
      kind: "Text",
      internalName: this.name,
      multiline: true,
      ...common(o),
      ...(o.richText !== undefined ? { richText: o.richText } : {}),
      ...(o.appendOnly !== undefined ? { appendOnly: o.appendOnly } : {}),
      ...(o.numberOfLines !== undefined
        ? { numberOfLines: o.numberOfLines }
        : {}),
    };
  }
  number(
    o: CommonOpts & {
      min?: number;
      max?: number;
      decimalPlaces?: number | "auto";
      showAsPercentage?: boolean;
    } = {},
  ): FieldSpec {
    return {
      kind: "Number",
      internalName: this.name,
      ...common(o),
      ...(o.min !== undefined ? { min: o.min } : {}),
      ...(o.max !== undefined ? { max: o.max } : {}),
      ...(o.decimalPlaces !== undefined
        ? { decimalPlaces: o.decimalPlaces }
        : {}),
      ...(o.showAsPercentage !== undefined
        ? { showAsPercentage: o.showAsPercentage }
        : {}),
    };
  }
  currency(
    o: CommonOpts & {
      decimalPlaces: number;
      currencyCode?: string;
      min?: number;
      max?: number;
    },
  ): FieldSpec {
    return {
      kind: "Currency",
      internalName: this.name,
      decimalPlaces: o.decimalPlaces,
      ...common(o),
      ...(o.currencyCode !== undefined ? { currencyCode: o.currencyCode } : {}),
      ...(o.min !== undefined ? { min: o.min } : {}),
      ...(o.max !== undefined ? { max: o.max } : {}),
    };
  }
  boolean(o: CommonOpts = {}): FieldSpec {
    return { kind: "Boolean", internalName: this.name, ...common(o) };
  }
  dateTime(
    o: CommonOpts & {
      displayFormat?: "DateOnly" | "DateTime";
      friendlyFormat?: "Disabled" | "Relative";
      min?: string;
      max?: string;
    } = {},
  ): FieldSpec {
    return {
      kind: "DateTime",
      internalName: this.name,
      displayFormat: o.displayFormat ?? "DateTime",
      friendlyFormat: o.friendlyFormat ?? "Disabled",
      ...common(o),
      ...(o.min !== undefined ? { min: o.min } : {}),
      ...(o.max !== undefined ? { max: o.max } : {}),
    };
  }
  choice(
    choices: string[],
    o: CommonOpts & {
      fillIn?: boolean;
      displayAs?: "Dropdown" | "RadioButtons";
    } = {},
  ): FieldSpec {
    return {
      kind: "Choice",
      internalName: this.name,
      multi: false,
      choices,
      fillIn: o.fillIn ?? false,
      displayAs: o.displayAs ?? "Dropdown",
      ...common(o),
    };
  }
  multiChoice(
    choices: string[],
    o: CommonOpts & {
      fillIn?: boolean;
      displayAs?: "Dropdown" | "RadioButtons";
    } = {},
  ): FieldSpec {
    return {
      kind: "Choice",
      internalName: this.name,
      multi: true,
      choices,
      fillIn: o.fillIn ?? false,
      displayAs: o.displayAs ?? "Dropdown",
      ...common(o),
    };
  }
  lookup(
    o: CommonOpts & { list: string; showField?: string; multi?: boolean },
  ): FieldSpec {
    return {
      kind: "Lookup",
      internalName: this.name,
      list: o.list,
      showField: o.showField ?? "Title",
      multi: o.multi ?? false,
      ...common(o),
    };
  }
  user(
    o: CommonOpts & { showField?: string; multi?: boolean } = {},
  ): FieldSpec {
    return {
      kind: "User",
      internalName: this.name,
      showField: o.showField ?? "Title",
      multi: o.multi ?? false,
      ...common(o),
    };
  }
}
