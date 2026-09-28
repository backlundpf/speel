import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import type { IEntity, EntityCtor, EntityType } from "@speel/core";
import { useSpeelContext, useSpeelUI, useFiscalYearStart } from "../context.js";
import {
  resolveColumns,
  type ColumnSpec,
  type ColumnDescriptor,
} from "./columns.js";
import type { TableColumn, RowIntent } from "../adapter/SpeelUIAdapter.js";
import { FilterBar, type FilterState } from "./filter/FilterBar.js";
import { isActiveCriteria } from "./filter/match.js";
import { FilterControl } from "./filter/controls.js";
import {
  useTableState,
  type FilterOrigin,
  type TableState,
} from "./useTableState.js";
import { TableFooter } from "./TableFooter.js";
import { TableToolbar } from "./TableToolbar.js";
import { TableSearch } from "./TableSearch.js";
import { buildCsv, csvFileName, downloadCsv } from "./csv.js";
import { buildXlsx, downloadXlsx, xlsxFileName } from "./xlsx.js";
import { buildPrintHtml } from "./print.js";
import {
  arrangeColumns,
  visibleColumns,
  type ColumnState,
} from "./columnState.js";
import { ColumnChooser } from "./ColumnChooser.js";
import {
  ColumnChooserContext,
  type ColumnChooserAccess,
} from "./chooserContext.js";

/** Same length and the same row instance at every index. */
function sameRows<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** A custom per-row action rendered in the actions column after the built-ins. */
export interface RowAction<T> {
  key: string;
  /** Skin icon name (Fluent icon name in the v8 skin). */
  iconName: string;
  /** Tooltip + accessible name (icon-only button). */
  title: string;
  onClick: (row: T) => void;
}

export interface SpeelTableProps<T extends IEntity = IEntity> {
  of: EntityCtor<T>;
  items: readonly T[];
  columns?: ColumnSpec<T>[] | ((p: T) => (ColumnDescriptor<T> | T[keyof T])[]);
  rowActions?: {
    onView?: (row: T) => void;
    onEdit?: (row: T) => void;
    onDelete?: (row: T) => void;
    custom?: RowAction<T>[];
  };
  getRowKey?: (row: T) => string;
  emptyMessage?: string;
  sortable?: boolean;
  filterable?: boolean;
  /** Semantic row emphasis; the skin picks the colours so they stay consistent per skin. */
  rowIntent?: (row: T) => RowIntent | undefined;
  /** Raw class name for app-supplied CSS (an SPFx SCSS module class, a Tailwind class). */
  rowClassName?: (row: T) => string | undefined;
  /** Rows per page. Omitted renders every row. */
  pageSize?: number;
  /** Choices in the pager's size picker; `pageSize` is merged in when absent. */
  pageSizeOptions?: number[];
  /** Adds an Export CSV button to the toolbar. `true` names files after the entity. */
  exportCsv?: boolean | { fileNamePrefix?: string };
  /** Adds an Excel (.xlsx) download of the same rows and columns CSV exports — typed cells,
   *  bold header. `sheetName` defaults to the entity's name. */
  exportXlsx?: boolean | { fileNamePrefix?: string; sheetName?: string };
  /** Adds a Print button to the toolbar. `true` titles the report after the entity. */
  print?: boolean | { title?: string };
  /** Extra toolbar content, rendered before the Export button. */
  toolbar?: ReactNode;
  /** Adds a universal search box to the toolbar. It matches every visible column's text —
   *  what export and print read — and every whitespace-separated term must appear in a row.
   *  The text is part of `tableState`, so it rides the URL and views like a filter does. */
  search?: boolean | { placeholder?: string };
  /** The whole user-adjustable state — columns, sort, filters, paging — as one controlled
   *  value. The table reports every change through `onTableStateChange` and stays ignorant
   *  of where any of it is persisted. */
  tableState?: TableState;
  /** Seeds internal state when `tableState` is not supplied. */
  defaultTableState?: TableState;
  /** Fires on every change, in controlled and uncontrolled modes alike. */
  onTableStateChange?: (next: TableState) => void;
  /** Where a controlled `tableState`'s filters came from, so a key that names nothing fails
   *  as loudly as its author deserves. Spread in with `useTableViews().table`; hand-written
   *  state rarely needs it. */
  filterOrigins?: readonly FilterOrigin[];
  /** Adds a column chooser to the toolbar: visibility, order, and reset. */
  columnChooser?: boolean;
  /** What the page says this table is about — a drill-down, a URL-derived selection. Applied
   *  where the user is silent, marked in the filter bar, never persisted into a view.
   *  This is intent, NOT access control: a real constraint belongs in the query. */
  scope?: { filters?: FilterState };
  /** The rows the table currently matches — every page, after view, filters and search;
   *  the set CSV, Excel and print read. Fires on mount and whenever that set changes — its
   *  rows or their order — not merely when the array is rebuilt: same rows in the same
   *  order is no call, however `columns` or the callback were passed. */
  onMatchedRowsChange?: (rows: readonly T[]) => void;
}

export interface SpeelTableHandle {
  /** Downloads the current filtered-and-sorted rows — every one, not just the visible page. */
  exportCsv: () => void;
  /** The same rows and columns as `exportCsv`, as an .xlsx workbook. */
  exportXlsx: () => void;
  /** Opens a print window for the same rows and columns the screen shows. */
  print: () => void;
}

function SpeelTableInner<T extends IEntity>(
  props: SpeelTableProps<T>,
  ref: Ref<SpeelTableHandle>,
): JSX.Element {
  const {
    of,
    items,
    columns,
    rowActions,
    getRowKey,
    emptyMessage,
    sortable = true,
    filterable = true,
    rowIntent,
    rowClassName,
    pageSize,
    pageSizeOptions,
    exportCsv,
    exportXlsx,
    // Renamed on the way in: `print` would shadow `window.print` inside this body.
    print: printProp,
    toolbar,
    search: searchProp,
    tableState,
    defaultTableState,
    onTableStateChange,
    filterOrigins,
    columnChooser,
    scope,
    onMatchedRowsChange,
  } = props;
  const db = useSpeelContext();
  const ui = useSpeelUI();
  const fiscalStart = useFiscalYearStart();
  const et = db.model.findEntityType(of as never) as EntityType | undefined;
  if (!et)
    throw new Error(
      `SpeelTable: ${(of as { name?: string }).name ?? "entity"} is not a registered entity.`,
    );

  const resolved = useMemo(
    () =>
      resolveColumns<T>(
        et,
        columns as ColumnSpec<T>[] | ((p: T) => unknown[]) | undefined,
      ),
    [et, columns],
  );

  const {
    sort,
    onSortChange,
    effectiveFilters: filters,
    scopeKeys,
    setFilter,
    clearFilter,
    clearAllFilters,
    search,
    searchActive,
    setSearch,
    displayed,
    matched,
    columnState: activeColumnState,
    setColumnState,
    onColumnResize,
    sessionWidths,
    page,
    setPage,
    pageSize: activePageSize,
    setPageSize,
    pageCount,
    total,
  } = useTableState<T>({
    items,
    et,
    columns: resolved,
    sortable,
    filterable,
    ...(pageSize !== undefined ? { pageSize } : {}),
    ...(tableState !== undefined ? { tableState } : {}),
    ...(defaultTableState !== undefined ? { defaultTableState } : {}),
    ...(onTableStateChange !== undefined ? { onTableStateChange } : {}),
    ...(filterOrigins !== undefined ? { filterOrigins } : {}),
    ...(scope?.filters !== undefined ? { scopeFilters: scope.filters } : {}),
  });

  // The charts-over-a-table pattern: whoever renders above this table wants the same rows
  // export sees. The ref keeps a fresh callback identity from re-firing the effect; only a
  // change in the matched set does.
  const onMatchedRef = useRef(onMatchedRowsChange);
  onMatchedRef.current = onMatchedRowsChange;
  // Content, not array identity: a fresh `columns` factory (the common way to pass
  // columns) rebuilds `matched` every render, and a consumer that lifts the rows into
  // state would otherwise re-render into a loop. Same rows in the same order = no call.
  const lastMatchedRef = useRef<readonly T[] | undefined>(undefined);
  useEffect(() => {
    const last = lastMatchedRef.current;
    if (last !== undefined && sameRows(last, matched)) return;
    lastMatchedRef.current = matched;
    onMatchedRef.current?.(matched);
  }, [matched]);

  // `useTableState` keeps the FULL resolved list: filter matching and sort lookup resolve a
  // column by key, and that must keep succeeding for a column the user has hidden — otherwise
  // hiding a filtered column would quietly widen the result set. Only the render path and
  // export consume the visible arrangement.
  const arranged = useMemo(
    () => arrangeColumns(resolved, activeColumnState),
    [resolved, activeColumnState],
  );
  // A live resize wins over any descriptor or view width, for this mount only.
  const visible = useMemo(
    () =>
      visibleColumns(arranged).map((c) =>
        sessionWidths[c.key] !== undefined
          ? { ...c, width: sessionWidths[c.key]! }
          : c,
      ),
    [arranged, sessionWidths],
  );

  const tableColumns: TableColumn[] = visible.map((c) => ({
    key: c.key,
    header: c.header,
    render: (row: unknown) => c.render(row as T),
    // `visibleColumns` has already layered any user resize over the descriptor width.
    ...(c.width !== undefined ? { width: c.width } : {}),
    ...(sortable && c.sortable ? { sortable: true } : {}),
    ...(filterable && c.filter
      ? {
          headerFilter: {
            active:
              filters[c.key] !== undefined && isActiveCriteria(filters[c.key]!),
            content: (
              <FilterControl
                ui={ui}
                label={c.header}
                config={c.filter.config}
                {...(c.filter.fieldConfig !== undefined
                  ? { fieldConfig: c.filter.fieldConfig }
                  : {})}
                criteria={filters[c.key]}
                onChange={(crit) => setFilter(c.key, crit)}
                fiscalStart={fiscalStart}
              />
            ),
          },
        }
      : {}),
  }));

  const ra = rowActions ?? {};
  const customActions = ra.custom ?? [];
  if (ra.onView || ra.onEdit || ra.onDelete || customActions.length > 0) {
    tableColumns.push({
      key: "__actions",
      header: "",
      width: 170 + customActions.length * 36,
      render: (row: unknown) => (
        <div style={{ display: "flex", gap: 4 }}>
          {ra.onView ? (
            <ui.IconButton
              iconName="View"
              title="View"
              onClick={() => ra.onView!(row as T)}
            />
          ) : null}
          {ra.onEdit ? (
            <ui.IconButton
              iconName="Edit"
              title="Edit"
              onClick={() => ra.onEdit!(row as T)}
            />
          ) : null}
          {ra.onDelete ? (
            <ui.IconButton
              iconName="Delete"
              title="Delete"
              onClick={() => ra.onDelete!(row as T)}
            />
          ) : null}
          {customActions.map((a) => (
            <ui.IconButton
              key={a.key}
              iconName={a.iconName}
              title={a.title}
              onClick={() => a.onClick(row as T)}
            />
          ))}
        </div>
      ),
    });
  }

  const sizeOptions =
    activePageSize === undefined
      ? []
      : Array.from(
          new Set([...(pageSizeOptions ?? [10, 25, 50, 100]), activePageSize]),
        ).sort((a, b) => a - b);

  // `visible` rather than `tableColumns`, so the actions column is excluded without filtering —
  // and export follows visibility, since export mirrors the screen.
  const runExport = (): void => {
    const prefix =
      (typeof exportCsv === "object" ? exportCsv.fileNamePrefix : undefined) ??
      (of as { name?: string }).name ??
      "export";
    downloadCsv(csvFileName(prefix, new Date()), buildCsv(visible, matched));
  };

  const runExportXlsx = (): void => {
    const opts = typeof exportXlsx === "object" ? exportXlsx : undefined;
    const entityName = (of as { name?: string }).name;
    const prefix = opts?.fileNamePrefix ?? entityName ?? "export";
    const sheetName = opts?.sheetName ?? entityName ?? "Sheet1";
    downloadXlsx(
      xlsxFileName(prefix, new Date()),
      buildXlsx(visible, matched, sheetName),
    );
  };

  const runPrint = (): void => {
    const title =
      (typeof printProp === "object" ? printProp.title : undefined) ??
      (of as { name?: string }).name ??
      "Print";
    const w = window.open("", "_blank");
    if (!w) return; // popup blocked — a silent no-op, no toast plumbing this cycle
    w.document.write(buildPrintHtml(title, visible, matched, new Date()));
    w.document.close();
    w.addEventListener("afterprint", () => w.close());
    w.focus();
    w.print();
  };
  useImperativeHandle(ref, () => ({
    exportCsv: runExport,
    exportXlsx: runExportXlsx,
    print: runPrint,
  }));

  const keyName = et.key.propertyName;
  const rowKey = getRowKey
    ? (row: unknown): string => getRowKey(row as T)
    : (row: unknown, i: number): string =>
        String((row as Record<string, unknown>)[keyName] ?? i);

  // A view picker in the toolbar slot adopts the chooser into its own menu; the standalone
  // button stays for tables that enable the chooser without a picker.
  const [chooserAdopters, setChooserAdopters] = useState(0);
  const adoptChooser = useCallback((): (() => void) => {
    setChooserAdopters((n) => n + 1);
    return () => setChooserAdopters((n) => n - 1);
  }, []);
  const chooserAccess = useMemo<ColumnChooserAccess | undefined>(
    () =>
      columnChooser
        ? { arranged, onChange: setColumnState, adopt: adoptChooser }
        : undefined,
    [columnChooser, arranged, setColumnState, adoptChooser],
  );

  const hasActiveFilters = Object.keys(filters).some(
    (k) => filters[k] !== undefined && isActiveCriteria(filters[k]!),
  );

  const body = (
    <div>
      <TableToolbar
        ui={ui}
        {...(exportCsv ? { onExport: runExport } : {})}
        {...(exportXlsx ? { onExportXlsx: runExportXlsx } : {})}
        {...(printProp ? { onPrint: runPrint } : {})}
        {...(columnChooser && chooserAdopters === 0
          ? {
              chooser: (
                <ColumnChooser<T>
                  ui={ui}
                  arranged={arranged}
                  onChange={setColumnState}
                />
              ),
            }
          : {})}
        {...(searchProp
          ? {
              search: (
                <TableSearch
                  ui={ui}
                  value={search}
                  onChange={setSearch}
                  {...(typeof searchProp === "object" &&
                  searchProp.placeholder !== undefined
                    ? { placeholder: searchProp.placeholder }
                    : {})}
                />
              ),
            }
          : {})}
        {...(filterable && hasActiveFilters
          ? {
              filters: (
                <FilterBar
                  et={et}
                  columns={resolved}
                  state={filters}
                  scopeKeys={scopeKeys}
                  onClear={clearFilter}
                  onClearAll={clearAllFilters}
                  ui={ui}
                />
              ),
            }
          : {})}
      >
        {toolbar}
      </TableToolbar>
      <ui.Table
        columns={tableColumns}
        items={displayed}
        getRowKey={rowKey}
        {...(emptyMessage !== undefined ? { emptyMessage } : {})}
        {...(sortable ? { onSortChange, ...(sort ? { sort } : {}) } : {})}
        {...(rowIntent
          ? { getRowIntent: (row: unknown) => rowIntent(row as T) }
          : {})}
        {...(rowClassName
          ? { getRowClassName: (row: unknown) => rowClassName(row as T) }
          : {})}
        onColumnResize={onColumnResize}
      />
      <TableFooter
        ui={ui}
        shown={total}
        total={items.length}
        filtered={hasActiveFilters || searchActive}
        {...(activePageSize !== undefined
          ? {
              paging: {
                page,
                pageCount,
                pageSize: activePageSize,
                pageSizeOptions: sizeOptions,
                onPage: setPage,
                onPageSize: setPageSize,
              },
            }
          : {})}
      />
    </div>
  );

  return chooserAccess ? (
    <ColumnChooserContext.Provider value={chooserAccess}>
      {body}
    </ColumnChooserContext.Provider>
  ) : (
    body
  );
}

export const SpeelTable = forwardRef(SpeelTableInner) as unknown as <
  T extends IEntity,
>(
  props: SpeelTableProps<T> & { ref?: Ref<SpeelTableHandle> },
) => JSX.Element;
