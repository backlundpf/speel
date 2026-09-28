import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
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

import type { TableColumn, TableProps, TableSort } from "@speel/react";

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
      {column.sortable && onSortChange ? (
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
                style={c.width !== undefined ? { width: c.width } : undefined}
              >
                <HeaderCell
                  column={c}
                  sort={p.sort}
                  onSortChange={p.onSortChange}
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {p.items.map((row, i) => (
            <TableRow key={p.getRowKey ? p.getRowKey(row, i) : i}>
              {p.columns.map((c) => (
                <TableCell
                  key={c.key}
                  className={cn(c.width !== undefined && "truncate")}
                >
                  {c.render(row) as ReactNode}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
