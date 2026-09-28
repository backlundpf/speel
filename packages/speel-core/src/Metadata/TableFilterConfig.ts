/** Named relative date ranges offered by a `dateRange` table filter. */
export type DatePreset =
  | "today"
  | "thisWeek"
  | "thisMonth"
  | "thisQuarter"
  | "thisYear"
  | "thisFiscalQuarter"
  | "thisFiscalYear"
  | "last7Days"
  | "last30Days"
  | "yearToDate";

/**
 * Declarative per-column table-filter override (set via `.useTableFilter(...)`).
 * Core only *names* the filter + params; `@speel/react` renders the control and runs the match.
 * When unset, the React table infers a default from `FieldConfig.kind`.
 */
export type TableFilterConfig =
  | { kind: "text" }
  | { kind: "numberRange" }
  | { kind: "dateRange"; presets?: readonly DatePreset[] }
  | { kind: "select"; multi?: boolean; options?: readonly unknown[] }
  | { kind: "boolean" }
  | { kind: "none" };
