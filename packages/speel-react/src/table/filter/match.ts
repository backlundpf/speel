import type { FieldConfig } from "@speel/core";
import { isEmptyValue, displayString } from "../fieldValue.js";

export type FilterCriteria =
  | { kind: "text"; query: string }
  | { kind: "numberRange"; min?: number; max?: number }
  | {
      kind: "dateRange";
      from?: Date;
      to?: Date;
      preset?: import("@speel/core").DatePreset;
    }
  | { kind: "select"; selected: readonly unknown[] }
  | { kind: "boolean"; value: boolean };

/** Does this criteria actually constrain anything (vs. an untouched control)? */
export function isActiveCriteria(c: FilterCriteria): boolean {
  switch (c.kind) {
    case "text":
      return c.query.trim() !== "";
    case "numberRange":
      return c.min !== undefined || c.max !== undefined;
    case "dateRange":
      return c.from !== undefined || c.to !== undefined;
    case "select":
      return c.selected.length > 0;
    case "boolean":
      return true;
  }
}

function identity(config: FieldConfig | undefined): (o: unknown) => unknown {
  if (config && config.kind === "Choice" && config.optionsValue) {
    return config.optionsValue;
  }
  return (o: unknown) => o;
}

/** Does a row's raw field value pass the criteria? Inactive criteria pass. */
export function matches(
  config: FieldConfig | undefined,
  criteria: FilterCriteria,
  value: unknown,
): boolean {
  if (!isActiveCriteria(criteria)) return true;
  switch (criteria.kind) {
    case "text":
      return displayString(config, value)
        .toLowerCase()
        .includes(criteria.query.trim().toLowerCase());
    case "numberRange": {
      if (isEmptyValue(value)) return false;
      const n = Number(value);
      if (criteria.min !== undefined && n < criteria.min) return false;
      if (criteria.max !== undefined && n > criteria.max) return false;
      return true;
    }
    case "dateRange": {
      if (isEmptyValue(value)) return false;
      const t =
        value instanceof Date
          ? value.getTime()
          : new Date(value as string).getTime();
      if (criteria.from !== undefined && t < criteria.from.getTime())
        return false;
      if (criteria.to !== undefined) {
        const toEnd = new Date(
          criteria.to.getFullYear(),
          criteria.to.getMonth(),
          criteria.to.getDate(),
          23,
          59,
          59,
          999,
        ).getTime();
        if (t > toEnd) return false;
      }
      return true;
    }
    case "select": {
      const ident = identity(config);
      const sel = new Set(criteria.selected.map(ident));
      const vals = Array.isArray(value) ? value : [value];
      return vals.some((v) => sel.has(ident(v)));
    }
    case "boolean":
      return value === criteria.value;
  }
}
