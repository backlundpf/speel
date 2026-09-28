import {
  declaredOptions,
  type FieldConfig,
  type TableFilterConfig,
  type DatePreset,
} from "@speel/core";
import type {
  SpeelUIAdapter,
  OptionItem,
} from "../../adapter/SpeelUIAdapter.js";
import type { FilterCriteria } from "./match.js";
import { resolvePreset } from "./presets.js";
import { PRESET_LABELS } from "./format.js";

export interface FilterControlProps {
  ui: SpeelUIAdapter;
  label: string;
  config: TableFilterConfig;
  fieldConfig?: FieldConfig;
  criteria: FilterCriteria | undefined;
  onChange: (c: FilterCriteria | undefined) => void;
  fiscalStart: number;
}

function choiceOptions(
  config: TableFilterConfig,
  fieldConfig?: FieldConfig,
): OptionItem[] {
  const opts =
    (config.kind === "select" && config.options) ||
    (fieldConfig && fieldConfig.kind === "Choice"
      ? (declaredOptions(fieldConfig) ?? [])
      : []);
  const render =
    fieldConfig && fieldConfig.kind === "Choice" && fieldConfig.optionsRender
      ? fieldConfig.optionsRender
      : (o: unknown) => o;
  return (opts ?? []).map((o, i) => ({
    key: String(i),
    text: String(render(o)) as string,
    data: o,
  }));
}

export function FilterControl(p: FilterControlProps): JSX.Element {
  const { ui, label, config, fieldConfig, criteria, onChange, fiscalStart } = p;

  switch (config.kind) {
    case "text": {
      const query = criteria?.kind === "text" ? criteria.query : "";
      return (
        <ui.TextInput
          label={label}
          value={query}
          onChange={(v) => onChange(v ? { kind: "text", query: v } : undefined)}
        />
      );
    }

    case "numberRange": {
      const cur =
        criteria?.kind === "numberRange"
          ? criteria
          : { kind: "numberRange" as const };
      const emit = (next: { min?: number; max?: number }): void => {
        const hasMin = next.min !== undefined;
        const hasMax = next.max !== undefined;
        if (!hasMin && !hasMax) {
          onChange(undefined);
          return;
        }
        const c = {
          kind: "numberRange" as const,
          ...(next.min !== undefined ? { min: next.min } : {}),
          ...(next.max !== undefined ? { max: next.max } : {}),
        };
        onChange(c);
      };
      return (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <ui.NumberInput
            label={`${label} min`}
            value={cur.min}
            onChange={(v) =>
              emit({
                ...(v !== undefined ? { min: v } : {}),
                ...(cur.max !== undefined ? { max: cur.max } : {}),
              })
            }
          />
          <ui.NumberInput
            label={`${label} max`}
            value={cur.max}
            onChange={(v) =>
              emit({
                ...(cur.min !== undefined ? { min: cur.min } : {}),
                ...(v !== undefined ? { max: v } : {}),
              })
            }
          />
        </div>
      );
    }

    case "boolean": {
      const value =
        criteria?.kind === "boolean" ? (criteria.value ? "yes" : "no") : "all";
      const options: OptionItem[] = [
        { key: "all", text: "All", data: "all" },
        { key: "yes", text: "Yes", data: "yes" },
        { key: "no", text: "No", data: "no" },
      ];
      return (
        <ui.Dropdown
          label={label}
          value={value}
          options={options}
          onChange={(v) =>
            onChange(
              v === "yes"
                ? { kind: "boolean", value: true }
                : v === "no"
                  ? { kind: "boolean", value: false }
                  : undefined,
            )
          }
        />
      );
    }

    case "select": {
      const options = choiceOptions(config, fieldConfig);
      const selected = criteria?.kind === "select" ? criteria.selected : [];
      const value = options.filter((o) => selected.includes(o.data));
      const fold = (s: string): string => s.toLowerCase();
      return (
        <ui.Combobox
          label={label}
          multi={config.multi !== false}
          value={value}
          onResolveSuggestions={async (q) =>
            options.filter((o) => fold(String(o.text)).includes(fold(q)))
          }
          onChange={(v) =>
            onChange(
              v.length
                ? { kind: "select", selected: v.map((o) => o.data) }
                : undefined,
            )
          }
        />
      );
    }

    case "dateRange": {
      const cur =
        criteria?.kind === "dateRange"
          ? criteria
          : { kind: "dateRange" as const };
      const emit = (next: { from?: Date; to?: Date }): void => {
        const has = next.from !== undefined || next.to !== undefined;
        if (!has) {
          onChange(undefined);
          return;
        }
        const c = {
          kind: "dateRange" as const,
          ...(next.from !== undefined ? { from: next.from } : {}),
          ...(next.to !== undefined ? { to: next.to } : {}),
        };
        onChange(c);
      };
      const presets = config.presets ?? [];
      const presetOptions: OptionItem[] = presets.map((pr) => ({
        key: pr,
        text: PRESET_LABELS[pr],
        data: pr,
      }));
      return (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {presetOptions.length > 0 ? (
            <ui.Dropdown
              label={`${label} preset`}
              value={undefined}
              options={presetOptions}
              onChange={(v) => {
                if (typeof v !== "string") return;
                const r = resolvePreset(
                  v as DatePreset,
                  fiscalStart,
                  new Date(),
                );
                onChange({
                  kind: "dateRange",
                  from: r.from,
                  to: r.to,
                  preset: v as DatePreset,
                });
              }}
            />
          ) : null}
          <ui.DatePicker
            label={`${label} from`}
            value={cur.from}
            onChange={(d) =>
              emit({
                ...(d !== undefined ? { from: d } : {}),
                ...(cur.to !== undefined ? { to: cur.to } : {}),
              })
            }
          />
          <ui.DatePicker
            label={`${label} to`}
            value={cur.to}
            onChange={(d) =>
              emit({
                ...(cur.from !== undefined ? { from: cur.from } : {}),
                ...(d !== undefined ? { to: d } : {}),
              })
            }
          />
        </div>
      );
    }

    case "none":
    default:
      return <></>;
  }
}
