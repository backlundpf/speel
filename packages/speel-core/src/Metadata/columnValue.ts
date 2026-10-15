import type { FieldConfig } from "./FieldConfig.js";

/**
 * Whether a column holds several values, each its own wire value: a multi Lookup or a
 * multi Choice. Decided from config alone, never from the value's runtime shape — a
 * single-valued column whose model happens to be an array (a Note holding a JSON-encoded
 * list) is one value, and so is a MultiJson column (one JSON string holding every element).
 */
export function isMultiValued(config: FieldConfig): boolean {
  return (config.kind === "Lookup" || config.kind === "Choice") && config.multi;
}

/**
 * Runs `fn` the way a codec runs on this column: per element for a multi-valued column
 * holding an array, otherwise once on the whole value.
 */
export function mapColumnValue(
  config: FieldConfig,
  value: unknown,
  fn: (v: unknown) => unknown,
): unknown {
  return isMultiValued(config) && Array.isArray(value)
    ? value.map((x) => fn(x))
    : fn(value);
}
