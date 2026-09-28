import type { FieldConfig } from "./FieldConfig.js";

type Selection = Extract<FieldConfig, { kind: "Choice" | "Lookup" }>;

/**
 * The option list when the model spelled it out, else `undefined`.
 *
 * Anything that must answer synchronously — membership validation, the column's
 * SharePoint `Choices`, declared-order sorting, the filter bar — can only use a
 * literal list. A thunk or a server query is not known until something runs, so to
 * those readers the list is OPEN, and each says what open means for it.
 *
 * A declared `optionsQueryAsync` makes the list open even beside a literal
 * `options`: the UI asks the query and ignores the list, so the query decides what
 * can be picked. Treating the literal list as closed would reject (and provision a
 * column refusing) values the query itself offered.
 */
export function declaredOptions(
  config: Selection,
): readonly unknown[] | undefined {
  if (config.optionsQueryAsync !== undefined) return undefined;
  return Array.isArray(config.options) ? config.options : undefined;
}
