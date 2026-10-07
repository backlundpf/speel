import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { setOverflowTitle, useResizable } from "@speel/react";
import type {
  RowIntent,
  TableColumn,
  TableProps,
  TableSort,
} from "@speel/react";

import { ShadIconButton } from "./fields";
import { ShadPopover } from "./overlays";

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
  return (
    <span className="flex w-full items-center gap-1">
      {column.headerContent !== undefined ? (
        // A control in the header owns its clicks: it is never wrapped in the sort button.
        <span className="min-w-0 grow">
          {column.headerContent as ReactNode}
        </span>
      ) : column.sortable && onSortChange ? (
        <button
          type="button"
          className="hover:bg-accent group flex min-w-0 grow items-center gap-1 rounded px-1.5 py-1 text-left"
          aria-label={
            sorted
              ? `${column.header}, sorted ${sort!.direction === "asc" ? "ascending" : "descending"}`
              : `${column.header}, sortable`
          }
          onClick={() => onSortChange(column.key)}
        >
          <span className="truncate">{column.header}</span>
          {sorted ? (
            sort!.direction === "asc" ? (
              <ArrowUp className="size-3.5" />
            ) : (
              <ArrowDown className="size-3.5" />
            )
          ) : (
            <ChevronsUpDown className="size-3.5 opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60" />
          )}
        </button>
      ) : (
        <span className="min-w-0 grow">{column.header}</span>
      )}
      {column.headerFilter ? (
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
      ) : null}
    </span>
  );
}

function ResizeHandle({
  columnKey,
  width,
  onColumnResize,
}: {
  columnKey: string;
  width: number | undefined;
  onColumnResize: (key: string, width: number) => void;
}): ReactElement {
  const { size, handleProps } = useResizable({
    axis: "x",
    min: { w: 60 },
    initial: { w: width ?? 150 },
  });
  const reported = useRef<number | undefined>(undefined);
  useEffect(() => {
    const w = size.w;
    if (w !== undefined && w !== reported.current) {
      reported.current = w;
      onColumnResize(columnKey, w);
    }
  }, [size.w, columnKey, onColumnResize]);
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
  if (p.items.length === 0) {
    return (
      <div className="text-muted-foreground py-4 text-sm">
        {p.emptyMessage ?? "No items."}
      </div>
    );
  }
  return (
    // grid grid-cols-1 (= minmax(0,1fr)) caps the table width inside flex/grid
    // parents (e.g. the SharePoint canvas section) whose default min-width:auto
    // would otherwise let the table inflate its own container and defeat the
    // overflow-x-auto scroll.
    <div className="grid grid-cols-1">
      <Table>
        <TableHeader>
          <TableRow>
            {p.columns.map((c) => (
              <TableHead
                key={c.key}
                className="relative"
                style={c.width !== undefined ? { width: c.width } : undefined}
              >
                <HeaderCell
                  column={c}
                  sort={p.sort}
                  onSortChange={p.onSortChange}
                />
                {p.onColumnResize ? (
                  <ResizeHandle
                    columnKey={c.key}
                    width={c.width}
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
                        ? "whitespace-normal"
                        : c.width !== undefined && "truncate",
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
