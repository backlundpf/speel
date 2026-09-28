import { declaredOptions, type FieldConfig } from "@speel/core";

export function isEmptyValue(v: unknown): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

/** A row value as a comparable/searchable display string (kind-aware). */
export function displayString(
  config: FieldConfig | undefined,
  value: unknown,
): string {
  if (isEmptyValue(value)) return "";
  if (!config) return String(value);
  switch (config.kind) {
    case "Lookup": {
      // A single row, or — for a multi-value person column / a collection — many.
      const label = (r: unknown): string =>
        String(
          (r as Record<string, unknown>)[config.displayField] ??
            (r as Record<string, unknown>)["Title"] ??
            "",
        );
      return Array.isArray(value)
        ? value.map(label).filter(Boolean).join(", ")
        : label(value);
    }
    case "Choice": {
      const render = config.optionsRender ?? ((o: unknown) => o);
      const arr = config.multi && Array.isArray(value) ? value : [value];
      return arr.map((o) => String(render(o))).join(", ");
    }
    default:
      return String(value);
  }
}

/**
 * Declared-order position of a choice value (via optionsValue identity); -1 if absent
 * OR if the option list is not literal (a thunk or a server query is not known here).
 */
export function choiceIndex(
  config: Extract<FieldConfig, { kind: "Choice" }>,
  value: unknown,
): number {
  const declared = declaredOptions(config);
  if (declared === undefined) return -1;
  const ident = config.optionsValue ?? ((o: unknown) => o);
  const target = ident(value);
  return declared.findIndex((o) => ident(o) === target);
}
