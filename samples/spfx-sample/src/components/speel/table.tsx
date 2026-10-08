import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, MouseEvent, ReactElement, ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  MIN_RESIZE_WIDTH,
  headerFloor,
  resolveColumnWidths,
  setOverflowTitle,
  textMeasurer,
  toFlexColumn,
  useContainerWidth,
  useResizable,
} from "@speel/react";
import type {
  HeaderRoom,
  RowIntent,
  TableColumn,
  TableProps,
  TableSort,
} from "@speel/react";

import { ShadIconButton } from "./fields";
import { ShadPopover } from "./overlays";

/** Tailwind's default spacing unit (`--spacing: 0.25rem`), used until the theme's is measured. */
const DEFAULT_SPACING = 4;

/**
 * The cell padding and header room this skin's markup takes, for a theme spacing unit of
 * `spacing` pixels. Every size involved is a Tailwind spacing multiple, so a density theme
 * that changes `--spacing` scales them all:
 * - padding: th `px-2` / td `p-2` — 2 units a side;
 * - label: the sort label's `px-1.5`;
 * - sortArrow: the `size-3.5` arrow and the `gap-1` before it;
 * - filterButton: `ShadIconButton`'s `size-8` and the `gap-1` before it.
 */
export function shadMetrics(spacing: number): {
  padding: number;
  room: HeaderRoom;
} {
  return {
    padding: 4 * spacing,
    room: {
      label: 3 * spacing,
      sortArrow: 4.5 * spacing,
      filterButton: 9 * spacing,
    },
  };
}

/** What the layout reads from the rendered table: the theme's spacing unit and header font. */
interface ShadTheme {
  spacing: number;
  /** CSS font shorthand the header labels render in. */
  font: string;
  fontSize: number;
}

/** `text-sm font-medium` at Tailwind's defaults, until the header is rendered to read. */
const DEFAULT_THEME: ShadTheme = {
  spacing: DEFAULT_SPACING,
  font: "500 14px sans-serif",
  fontSize: 14,
};

/**
 * Spacing units in the probe. Layout snaps a box to 1/64px, so the probe is ten units wide
 * rather than one: 0.2rem reads as 3.2, not 3.1875.
 */
const PROBE_UNITS = 10;

/** Reads the spacing unit off the probe (`w-10`) and the header font off a header cell. */
function readTheme(box: HTMLElement, probe?: HTMLElement): ShadTheme {
  const unit = (probe?.getBoundingClientRect().width ?? 0) / PROBE_UNITS;
  const spacing = Number.isFinite(unit) && unit > 0 ? unit : DEFAULT_SPACING;
  const th = box.querySelector("th");
  const style = th ? getComputedStyle(th) : undefined;
  const size = parseFloat(style?.fontSize ?? "");
  if (style && size > 0 && style.fontFamily)
    return {
      spacing,
      font: `${style.fontWeight || "500"} ${size}px ${style.fontFamily}`,
      fontSize: size,
    };
  const family = getComputedStyle(box).fontFamily || "sans-serif";
  return { spacing, font: `500 14px ${family}`, fontSize: 14 };
}

function HeaderCell({
  column,
  sort,
  onSortChange,
}: {
  column: TableColumn;
  sort?: TableSort;
  onSortChange?: (key: string) => void;
}): ReactElement {
  const [filterOpen, setFilterOpen] = useState(false);
  const sorted = sort?.key === column.key;
  const arrow = "inline size-3.5 align-middle";
  return (
    <span className="flex w-full items-start gap-1">
      {/* The label box takes what the filter button leaves. It breaks a label only at spaces;
          a word wider than the box ends in "…" (text-overflow applies to every line). Its
          py-1 levels the first line with the filter button and keeps the sort label's
          hover and focus boxes inside the clip. */}
      <span
        data-header-label=""
        className="min-w-0 flex-1 overflow-hidden py-1 text-ellipsis whitespace-normal [overflow-wrap:normal] [word-break:normal]"
      >
        {column.headerContent !== undefined ? (
          // A control in the header owns its clicks: it is never wrapped in the sort button.
          (column.headerContent as ReactNode)
        ) : column.sortable && onSortChange ? (
          // A span, not a <button>: a button lays out as one inline-block whatever its
          // `display`, so a wrapped label would be a single box the ellipsis hides whole.
          // Inline, each line is its own fragment, and its own rounded hover/focus box.
          <span
            role="button"
            tabIndex={0}
            className="hover:bg-accent focus-visible:ring-ring inline cursor-pointer rounded px-1.5 py-0.5 outline-none box-decoration-clone focus-visible:ring-2 focus-visible:ring-inset"
            aria-label={
              sorted
                ? `${column.header}, sorted ${sort!.direction === "asc" ? "ascending" : "descending"}`
                : `${column.header}, sortable`
            }
            onClick={() => onSortChange(column.key)}
            onKeyDown={(e: KeyboardEvent<HTMLSpanElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSortChange(column.key);
              }
            }}
          >
            <span title={column.header}>{column.header}</span>
            {/* The arrow only on the sorted column, as in the v8 skin: inline with a label
                that wraps, an invisible hover hint could hold a line of its own. An ordinary
                space before it: a last word that fits, but not with the arrow, keeps its
                line and the arrow takes the next. */}
            {sorted ? (
              <>
                {" "}
                {sort!.direction === "asc" ? (
                  <ArrowUp className={arrow} />
                ) : (
                  <ArrowDown className={arrow} />
                )}
              </>
            ) : null}
          </span>
        ) : (
          <span title={column.header}>{column.header}</span>
        )}
      </span>
      {column.headerFilter ? (
        <span className="shrink-0">
          <ShadPopover
            open={filterOpen}
            onOpenChange={setFilterOpen}
            trigger={
              <ShadIconButton
                iconName="Filter"
                title={`Filter ${column.header}`}
                toggled={column.headerFilter.active}
                onClick={() => setFilterOpen((o) => !o)}
              />
            }
          >
            {column.headerFilter.content as ReactNode}
          </ShadPopover>
        </span>
      ) : null}
    </span>
  );
}

/**
 * A column's drag handle. It starts from the column's laid-out width and is held to the
 * column's own `minWidth`/`maxWidth`, so every width it reports is one the layout honours.
 *
 * The host is expected to echo each report straight back as the column's width — SpeelTable
 * does, synchronously, on every move of a drag — and the grip carries on through the echo.
 * When the layout puts the column anywhere the grip is not — the container resizes, another
 * column is dragged — the grip restarts from there. Restarting on an echo would end the drag
 * after its first step (and drop keyboard focus); a host that applies widths later, or not
 * at all, simply leaves the grip where the user left it until the layout next moves.
 */
function ResizeHandle({
  columnKey,
  width,
  minWidth,
  maxWidth,
  onColumnResize,
}: {
  columnKey: string;
  /** The column's laid-out content width. */
  width: number;
  minWidth: number | undefined;
  maxWidth: number | undefined;
  onColumnResize: (key: string, width: number) => void;
}): ReactElement {
  // The width the grip is at: where it started, or the last width it reported.
  const at = useRef(width);
  // Restarts count up, so a restart to the width the grip started from still restarts it.
  const [start, setStart] = useState({ width, restarts: 0 });
  useLayoutEffect(() => {
    // Within a pixel: a host may round what it is told.
    if (Math.abs(width - at.current) < 1) return;
    at.current = width;
    setStart((s) => ({ width, restarts: s.restarts + 1 }));
  }, [width]);
  const onResize = useCallback(
    (w: number) => {
      at.current = w;
      onColumnResize(columnKey, w);
    },
    [columnKey, onColumnResize],
  );
  // CSS order: a minimum beats a maximum.
  const min = Math.max(MIN_RESIZE_WIDTH, minWidth ?? 0);
  return (
    <ResizeGrip
      key={start.restarts}
      columnKey={columnKey}
      initial={start.width}
      min={min}
      {...(maxWidth !== undefined ? { max: Math.max(maxWidth, min) } : {})}
      onResize={onResize}
    />
  );
}

function ResizeGrip({
  columnKey,
  initial,
  min,
  max,
  onResize,
}: {
  columnKey: string;
  initial: number;
  min: number;
  max?: number;
  onResize: (width: number) => void;
}): ReactElement {
  const { size, handleProps } = useResizable({
    axis: "x",
    min: { w: min },
    ...(max !== undefined ? { max: { w: max } } : {}),
    initial: { w: initial },
  });
  // Only the user's drags report: the width the grip mounted with is the layout's.
  const mounted = useRef(initial);
  useEffect(() => {
    if (size.w !== undefined && size.w !== mounted.current) {
      mounted.current = size.w;
      onResize(size.w);
    }
  }, [size.w, onResize]);
  return (
    <span
      {...handleProps}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${columnKey}`}
      className="hover:bg-border absolute top-0 right-0 h-full w-1 cursor-col-resize select-none"
    />
  );
}

const INTENT_ROW: Record<RowIntent, string> = {
  success: "bg-emerald-50 dark:bg-emerald-950/40",
  warning: "bg-amber-50 dark:bg-amber-950/40",
  error: "bg-destructive/10",
  muted: "text-muted-foreground bg-muted/40",
};

export function ShadTable(p: TableProps): ReactElement {
  // Hooks sit before the empty early-return: they may not be conditional.
  const container = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  // What a percentage bound is a percentage of. The empty state renders the same div, so
  // React keeps the measured element when rows arrive.
  const containerWidth = useContainerWidth(container);
  const [theme, setTheme] = useState<ShadTheme>(DEFAULT_THEME);
  const hasRows = p.items.length > 0;
  // Read again whenever the container's width changes: a table that mounted hidden (a
  // collapsed tab or section) measures nothing until it is shown.
  useLayoutEffect(() => {
    if (!hasRows || !container.current) return;
    const next = readTheme(container.current, probe.current ?? undefined);
    setTheme((prev) =>
      prev.spacing === next.spacing &&
      prev.font === next.font &&
      prev.fontSize === next.fontSize
        ? prev
        : next,
    );
  }, [hasRows, containerWidth]);

  if (!hasRows) {
    return (
      <div ref={container} className="text-muted-foreground py-4 text-sm">
        {p.emptyMessage ?? "No items."}
      </div>
    );
  }
  const metrics = shadMetrics(theme.spacing);
  const room = metrics.room;
  // Whole pixels, like the widths: a fractional padding would leave the columns' total a
  // fraction off the table's width, and a table that fills its container would scroll by it.
  const padding = Math.round(metrics.padding);
  const measure = textMeasurer(theme.font, theme.fontSize);
  const layout = resolveColumnWidths(
    p.columns.map((c) =>
      toFlexColumn(
        c,
        headerFloor(
          c,
          c.sortable === true &&
            p.onSortChange !== undefined &&
            c.headerContent === undefined,
          measure,
          room,
        ),
        padding,
      ),
    ),
    {
      ...(p.minWidth !== undefined ? { minWidth: p.minWidth } : {}),
      ...(p.width !== undefined ? { width: p.width } : {}),
      ...(p.maxWidth !== undefined ? { maxWidth: p.maxWidth } : {}),
    },
    containerWidth,
  );
  // The columns' total, never `layout.tableWidth`: a fixed-layout table spreads any width
  // beyond its columns over them, so a table held to a bound nothing can grow into would
  // widen every column past its resolved width, and a dragged column would not land where
  // it was let go. Spare width stays empty instead, as in CSS flexbox and the v8 skin.
  const tableWidth = layout.widths.reduce((sum, w) => sum + w + padding, 0);
  return (
    // grid grid-cols-1 (= minmax(0,1fr)) caps the table width inside flex/grid
    // parents (e.g. the SharePoint canvas section) whose default min-width:auto
    // would otherwise let the table inflate its own container and defeat the
    // overflow-x-auto scroll. It is also the box measured for the layout.
    <div ref={container} className="grid grid-cols-1">
      {/* PROBE_UNITS spacing units wide: how the theme's density is read. */}
      <span ref={probe} aria-hidden className="invisible absolute w-10" />
      {/* Fixed layout: the columns are exactly the resolved widths, whatever their content. */}
      <Table style={{ tableLayout: "fixed", width: tableWidth }}>
        <colgroup>
          {p.columns.map((c, i) => (
            <col key={c.key} style={{ width: layout.widths[i]! + padding }} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            {p.columns.map((c, i) => (
              // The primitive's h-10 stays: a table cell's height is a minimum, so a wrapped
              // label still grows the row, and one-line labels keep their height and centring.
              <TableHead key={c.key} className="relative whitespace-normal">
                <HeaderCell
                  column={c}
                  sort={p.sort}
                  onSortChange={p.onSortChange}
                />
                {p.onColumnResize ? (
                  <ResizeHandle
                    columnKey={c.key}
                    width={layout.widths[i]!}
                    minWidth={c.minWidth}
                    maxWidth={c.maxWidth}
                    onColumnResize={p.onColumnResize}
                  />
                ) : null}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {p.items.map((row, i) => {
            const intent = p.getRowIntent?.(row, i);
            const cls = p.getRowClassName?.(row, i);
            return (
              <TableRow
                key={p.getRowKey ? p.getRowKey(row, i) : i}
                className={cn(intent ? INTENT_ROW[intent] : undefined, cls)}
              >
                {p.columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      c.wrap
                        ? "overflow-hidden text-ellipsis whitespace-normal [overflow-wrap:normal] [word-break:normal]"
                        : "truncate",
                    )}
                    {...(c.cellTitle
                      ? {
                          onMouseEnter: (e: MouseEvent<HTMLTableCellElement>) =>
                            setOverflowTitle(e.currentTarget, () =>
                              c.cellTitle!(row),
                            ),
                        }
                      : {})}
                  >
                    {c.render(row) as ReactNode}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
