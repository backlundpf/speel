import {
  declaredOptions,
  type FieldConfig,
  type TableFilterConfig,
} from "@speel/core";

/** The filter inferred for a field column when `.useTableFilter` was not set. */
export function defaultFilterFor(config: FieldConfig): TableFilterConfig {
  switch (config.kind) {
    case "Number":
    case "Currency":
      return { kind: "numberRange" };
    case "DateTime":
      return { kind: "dateRange" };
    case "Boolean":
      return { kind: "boolean" };
    case "Choice":
      // A list that is not literal cannot populate a select's option list here, so an
      // open column falls back to a free-text filter.
      return declaredOptions(config)
        ? { kind: "select", multi: true }
        : { kind: "text" };
    case "Json":
      // No honest control: the filter kinds are per-scalar, and a shape is not one.
      return { kind: "none" };
    default:
      return { kind: "text" };
  }
}
