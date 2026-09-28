import type { FieldConfig, DatePreset } from "@speel/core";
import type { FilterCriteria } from "./match.js";

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  thisWeek: "This week",
  thisMonth: "This month",
  thisQuarter: "This quarter",
  thisYear: "This year",
  thisFiscalQuarter: "This fiscal quarter",
  thisFiscalYear: "This fiscal year",
  last7Days: "Last 7 days",
  last30Days: "Last 30 days",
  yearToDate: "Year to date",
};

function optionLabel(
  fieldConfig: FieldConfig | undefined,
): (o: unknown) => string {
  const render =
    fieldConfig && fieldConfig.kind === "Choice" && fieldConfig.optionsRender
      ? fieldConfig.optionsRender
      : (o: unknown) => o;
  return (o) => String(render(o));
}

const d = (date: Date): string => date.toLocaleDateString();

/** Human-readable applied-filter text for a FilterBar badge. */
export function formatCriteria(
  fieldConfig: FieldConfig | undefined,
  criteria: FilterCriteria,
): string {
  switch (criteria.kind) {
    case "text":
      return criteria.query.trim();
    case "numberRange":
      return criteria.min !== undefined && criteria.max !== undefined
        ? `${criteria.min}–${criteria.max}`
        : criteria.min !== undefined
          ? `≥ ${criteria.min}`
          : criteria.max !== undefined
            ? `≤ ${criteria.max}`
            : "";
    case "dateRange":
      if (criteria.preset) return PRESET_LABELS[criteria.preset];
      return criteria.from !== undefined && criteria.to !== undefined
        ? `${d(criteria.from)} – ${d(criteria.to)}`
        : criteria.from !== undefined
          ? `≥ ${d(criteria.from)}`
          : criteria.to !== undefined
            ? `≤ ${d(criteria.to)}`
            : "";
    case "select":
      return criteria.selected.map(optionLabel(fieldConfig)).join(", ");
    case "boolean":
      return criteria.value ? "Yes" : "No";
  }
}
