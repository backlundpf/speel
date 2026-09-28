import type { EntityType } from "@speel/core";
import type { SpeelUIAdapter } from "../../adapter/SpeelUIAdapter.js";
import { resolveKeyTarget, type ResolvedColumn } from "../columns.js";
import { isActiveCriteria, type FilterCriteria } from "./match.js";
import { formatCriteria } from "./format.js";

export type FilterState = Record<string, FilterCriteria>;

export interface FilterBarProps<T> {
  /** Resolves a chip's key when no column carries it — the field's own display name. */
  et: EntityType;
  columns: readonly ResolvedColumn<T>[];
  /** The effective set — the user's criteria over any app scope. */
  state: FilterState;
  /** Which of those came from scope and are not overridden. Provenance, not enforcement. */
  scopeKeys?: readonly string[];
  onClear: (key: string) => void;
  onClearAll: () => void;
  ui: SpeelUIAdapter;
}

export function FilterBar<T>({
  et,
  columns,
  state,
  scopeKeys,
  onClear,
  onClearAll,
  ui,
}: FilterBarProps<T>): JSX.Element | null {
  const activeKeys = Object.keys(state).filter(
    (k) => state[k] !== undefined && isActiveCriteria(state[k]!),
  );
  if (activeKeys.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      {activeKeys.map((k) => {
        const col = resolveKeyTarget<T>(et, columns, k);
        if (!col?.filter) return null;
        const fromScope = scopeKeys?.includes(k) === true;
        const label = formatCriteria(col.filter.fieldConfig, state[k]!);
        return (
          <span
            key={k}
            data-chip={k}
            data-testid={`chip-${k}`}
            data-source={fromScope ? "scope" : "user"}
            title={fromScope ? "Applied by this page" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: "2px 4px 2px 10px",
              fontSize: 12,
              borderStyle: fromScope ? "dashed" : "solid",
            }}
          >
            {`${col.displayName}: ${label}`}
            <ui.IconButton
              iconName="Cancel"
              title={`Clear ${col.displayName}`}
              onClick={() => onClear(k)}
            />
          </span>
        );
      })}
      <ui.Button text="Clear" appearance="subtle" onClick={onClearAll} />
    </div>
  );
}
