import type { ReactNode } from "react";
import type { SpeelUIAdapter } from "../adapter/SpeelUIAdapter.js";

export interface TableToolbarProps {
  ui: SpeelUIAdapter;
  onExport?: () => void;
  onExportXlsx?: () => void;
  onPrint?: () => void;
  chooser?: ReactNode;
  /** The active filter chips, grown to fill the row's centre. */
  filters?: ReactNode;
  /** The universal search box, between the chips and the icon actions. */
  search?: ReactNode;
  children?: ReactNode;
}

/** The table's single chrome row: the toolbar slot (view picker) on the left, filter chips
 *  filling the centre, then the search box and the icon actions pinned right. Renders
 *  nothing when empty. */
export function TableToolbar({
  ui,
  onExport,
  onExportXlsx,
  onPrint,
  chooser,
  filters,
  search,
  children,
}: TableToolbarProps): JSX.Element | null {
  if (
    !onExport &&
    !onExportXlsx &&
    !onPrint &&
    !chooser &&
    !children &&
    !filters &&
    !search
  )
    return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
        flexWrap: "wrap",
      }}
    >
      {children}
      <div style={{ flex: 1, minWidth: 0 }}>{filters}</div>
      {search ? <div style={{ width: 220 }}>{search}</div> : null}
      {chooser}
      {onExport ? (
        <ui.IconButton
          iconName="Download"
          title="Export CSV"
          onClick={onExport}
        />
      ) : null}
      {onExportXlsx ? (
        <ui.IconButton
          iconName="ExcelDocument"
          title="Export Excel"
          onClick={onExportXlsx}
        />
      ) : null}
      {onPrint ? (
        <ui.IconButton iconName="Print" title="Print" onClick={onPrint} />
      ) : null}
    </div>
  );
}
