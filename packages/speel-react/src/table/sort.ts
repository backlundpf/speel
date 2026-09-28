import { declaredOptions, type FieldConfig } from "@speel/core";
import { isEmptyValue, displayString, choiceIndex } from "./fieldValue.js";

export type Comparator = (a: unknown, b: unknown) => number;

function toTime(v: unknown): number {
  return v instanceof Date ? v.getTime() : new Date(v as string).getTime();
}

function naturalCompare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "boolean" && typeof b === "boolean")
    return a === b ? 0 : a ? 1 : -1;
  return String(a).localeCompare(String(b));
}

/** Compares two NON-empty raw field values per the field type (empties handled by applySort). */
export function comparatorFor(config: FieldConfig | undefined): Comparator {
  if (!config) return naturalCompare;
  switch (config.kind) {
    case "Number":
    case "Currency":
      return (a, b) => Number(a) - Number(b);
    case "DateTime":
      return (a, b) => toTime(a) - toTime(b);
    case "Boolean":
      return (a, b) => (a === b ? 0 : a ? 1 : -1);
    case "Choice":
      // A literal list orders by declared position; a thunk or a server query is not
      // known here, so an open column falls back to the display-text comparator.
      if (declaredOptions(config) !== undefined)
        return (a, b) => choiceIndex(config, a) - choiceIndex(config, b);
      return (a, b) =>
        displayString(config, a).localeCompare(displayString(config, b));
    default:
      return (a, b) =>
        displayString(config, a).localeCompare(displayString(config, b));
  }
}

/** Stable sort: empties always last, then comparator, then direction. */
export function applySort<T>(
  rows: readonly T[],
  accessor: (row: T) => unknown,
  comparator: Comparator,
  direction: "asc" | "desc",
): T[] {
  const dir = direction === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: accessor(row) }))
    .sort((x, y) => {
      const xe = isEmptyValue(x.v);
      const ye = isEmptyValue(y.v);
      if (xe && ye) return x.i - y.i;
      if (xe) return 1;
      if (ye) return -1;
      const c = comparator(x.v, y.v);
      return c !== 0 ? dir * c : x.i - y.i;
    })
    .map((e) => e.row);
}
