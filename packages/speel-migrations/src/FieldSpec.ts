export interface FieldSpecBase {
  internalName: string;
  displayName?: string;
  description?: string;
  required?: boolean;
  indexed?: boolean;
  default?: unknown;
  /**
   * Create the column hidden from forms and views. Creation only — `alterField`
   * does not toggle it. A hidden column never joins the default view.
   */
  hidden?: boolean;
  /**
   * Add the new column to the list's default view. Default true; pass `false`
   * for system or tracking columns. Creation only.
   */
  addToDefaultView?: boolean;
}

export type FieldSpec =
  | (FieldSpecBase & {
      kind: "Text";
      multiline: boolean;
      maxLength?: number;
      minLength?: number;
      richText?: boolean;
      appendOnly?: boolean;
      numberOfLines?: number;
    })
  | (FieldSpecBase & {
      kind: "Number";
      min?: number;
      max?: number;
      decimalPlaces?: number | "auto";
      showAsPercentage?: boolean;
    })
  | (FieldSpecBase & {
      kind: "Currency";
      currencyCode?: string;
      min?: number;
      max?: number;
      decimalPlaces: number;
    })
  | (FieldSpecBase & { kind: "Boolean" })
  | (FieldSpecBase & {
      kind: "DateTime";
      displayFormat: "DateOnly" | "DateTime";
      friendlyFormat: "Disabled" | "Relative";
      min?: string;
      max?: string;
    })
  | (FieldSpecBase & {
      kind: "Choice";
      multi: boolean;
      choices: string[];
      fillIn: boolean;
      displayAs: "Dropdown" | "RadioButtons";
    })
  | (FieldSpecBase & {
      kind: "Lookup";
      list: string;
      showField: string;
      multi: boolean;
    })
  | (FieldSpecBase & { kind: "User"; showField: string; multi: boolean });

export type FieldSpecKind = FieldSpec["kind"];
