import type { FieldSpec } from "@speel/migrations";

/**
 * The type-specific attributes an existing column can be MERGE-updated with.
 * Creation goes through CAML (`fieldSpecToXml`) instead — these are the subset
 * SharePoint accepts on `SP.Field` after the fact.
 */
function alterableProps(spec: FieldSpec): Record<string, unknown> {
  const num = (k: string, v: number | undefined): Record<string, number> =>
    v !== undefined ? { [k]: v } : {};

  switch (spec.kind) {
    case "Text":
      return spec.multiline
        ? {
            ...(spec.richText !== undefined ? { RichText: spec.richText } : {}),
            ...(spec.appendOnly !== undefined
              ? { AppendOnly: spec.appendOnly }
              : {}),
            ...(spec.numberOfLines !== undefined
              ? { NumberOfLines: spec.numberOfLines }
              : {}),
          }
        : { ...num("MaxLength", spec.maxLength) };
    case "Number":
    case "Currency":
      // CurrencyLocaleId is a numeric LCID, not a code like 'USD' — passing the
      // model's currencyCode makes the update 400 (Edm.Int32). Omit it.
      return {
        ...num("MinimumValue", spec.min),
        ...num("MaximumValue", spec.max),
      };
    case "Boolean":
      return {};
    case "DateTime":
      return { DisplayFormat: spec.displayFormat === "DateOnly" ? 0 : 1 };
    case "Choice":
      return { Choices: spec.choices, FillInChoice: spec.fillIn };
    case "Lookup":
    case "User":
      return {};
  }
}

/**
 * The SP field attributes that can change via `field.update()`. Excludes the
 * structural create-only props Lookup/User carry — a lookup's target and
 * cardinality cannot be altered in place, so SharePoint 400s on them.
 */
export function fieldSpecToUpdate(spec: FieldSpec): Record<string, unknown> {
  const update: Record<string, unknown> = { Required: spec.required ?? false };
  if (spec.displayName !== undefined) update.Title = spec.displayName;
  if (spec.description !== undefined) update.Description = spec.description;
  if (spec.indexed !== undefined) update.Indexed = spec.indexed;
  if (spec.kind !== "Lookup" && spec.kind !== "User") {
    Object.assign(update, alterableProps(spec));
  }
  return update;
}
