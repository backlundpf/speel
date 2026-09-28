import { useState } from "react";
import type { SpeelUIAdapter } from "../adapter/SpeelUIAdapter.js";
import {
  moveColumn,
  toggleColumn,
  type ArrangedColumn,
  type ColumnState,
} from "./columnState.js";

export interface ColumnChooserProps<T> {
  ui: SpeelUIAdapter;
  arranged: readonly ArrangedColumn<T>[];
  onChange: (next: ColumnState) => void;
}

/**
 * Lives in `@speel/react` rather than in a skin: the drag interaction is written once here
 * against plain DOM events and behaves identically everywhere, instead of each skin growing
 * its own implementation of the same thing. The move buttons are the keyboard path, and
 * double as the discoverable affordance for anyone who does not think to try dragging.
 *
 * The actions column never reaches here — it is appended to the adapter's columns separately —
 * so it stays pinned last and cannot be hidden or moved, with no special-casing.
 */
export function ColumnChooser<T>({
  ui,
  arranged,
  onChange,
}: ColumnChooserProps<T>): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <ui.Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <ui.IconButton
          iconName="ColumnOptions"
          title="Choose columns"
          toggled={open}
          onClick={() => setOpen((o) => !o)}
        />
      }
    >
      <ColumnChooserPanel ui={ui} arranged={arranged} onChange={onChange} />
    </ui.Popover>
  );
}

/** The chooser's body, host-agnostic: the standalone popover above and the view menu's
 *  "Choose columns" dialog render the same panel. */
export function ColumnChooserPanel<T>({
  ui,
  arranged,
  onChange,
}: ColumnChooserProps<T>): JSX.Element {
  const [dragKey, setDragKey] = useState<string | undefined>(undefined);
  const [overKey, setOverKey] = useState<string | undefined>(undefined);
  const visibleCount = arranged.filter((a) => !a.hidden).length;

  const drop = (toIndex: number): void => {
    if (dragKey !== undefined) onChange(moveColumn(arranged, dragKey, toIndex));
    setDragKey(undefined);
    setOverKey(undefined);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 220,
      }}
    >
      {arranged.map((a, i) => (
        <div
          key={a.column.key}
          data-column={a.column.key}
          draggable
          onDragStart={() => setDragKey(a.column.key)}
          onDragOver={(e) => {
            e.preventDefault();
            setOverKey(a.column.key);
          }}
          onDrop={(e) => {
            e.preventDefault();
            drop(i);
          }}
          onDragEnd={() => {
            setDragKey(undefined);
            setOverKey(undefined);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 4px",
            borderTop: `2px solid ${overKey === a.column.key && dragKey !== a.column.key ? "#0078d4" : "transparent"}`,
            opacity: dragKey === a.column.key ? 0.5 : 1,
          }}
        >
          <span
            aria-hidden="true"
            style={{ cursor: "grab", userSelect: "none" }}
          >
            ⋮⋮
          </span>
          <span style={{ flexGrow: 1, minWidth: 0 }}>
            <ui.Checkbox
              label={a.column.header}
              checked={!a.hidden}
              // A table with zero columns is a bug, not a preference.
              disabled={!a.hidden && visibleCount === 1}
              onChange={() => onChange(toggleColumn(arranged, a.column.key))}
            />
          </span>
          <ui.IconButton
            iconName="ChevronUp"
            title={`Move ${a.column.header} up`}
            disabled={i === 0}
            onClick={() => onChange(moveColumn(arranged, a.column.key, i - 1))}
          />
          <ui.IconButton
            iconName="ChevronDown"
            title={`Move ${a.column.header} down`}
            disabled={i === arranged.length - 1}
            onClick={() => onChange(moveColumn(arranged, a.column.key, i + 1))}
          />
        </div>
      ))}
      <ui.Button
        text="Reset columns"
        appearance="subtle"
        onClick={() => onChange([])}
      />
    </div>
  );
}
