import type { SpeelUIAdapter } from "../adapter/SpeelUIAdapter.js";

export interface TableFooterPaging {
  page: number;
  pageCount: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}

export interface TableFooterProps {
  ui: SpeelUIAdapter;
  /** Rows passing the effective filters. */
  shown: number;
  /** All rows the table was given. */
  total: number;
  /** Any filter active — switches the count from the plain total to "shown of total". */
  filtered: boolean;
  /** Omitted when the table does not page; the footer then carries the count alone. */
  paging?: TableFooterPaging;
}

/** The strip under the table: item count left, page navigation centred, page size right.
 *  The current page is a dropdown so a distant page is one pick away, not N clicks.
 *
 *  The pager is ONE inline row — `‹ Page [1] of 3 ›`. Its caption is plain text beside the
 *  picker rather than the picker's own label, because field chrome stacks the label above
 *  the control: the chevrons then centre against a two-line block and nothing in the row
 *  shares a baseline. */
export function TableFooter({
  ui,
  shown,
  total,
  filtered,
  paging,
}: TableFooterProps): JSX.Element {
  const items = `item${total === 1 ? "" : "s"}`;
  const count = filtered
    ? `${shown.toLocaleString()} of ${total.toLocaleString()} ${items}`
    : `${total.toLocaleString()} ${items}`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        marginTop: 8,
        flexWrap: "wrap",
      }}
    >
      <span data-testid="item-count">{count}</span>
      {paging ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ui.IconButton
            iconName="ChevronLeft"
            title="Previous page"
            disabled={paging.page <= 0}
            onClick={() => paging.onPage(paging.page - 1)}
          />
          <span>Page</span>
          <span style={{ display: "inline-block", minWidth: 72 }}>
            <ui.Dropdown
              ariaLabel="Page"
              value={paging.page + 1}
              options={Array.from({ length: paging.pageCount }, (_, i) => ({
                key: String(i + 1),
                text: String(i + 1),
                data: i + 1,
              }))}
              onChange={(v) => paging.onPage(Number(v) - 1)}
            />
          </span>
          <span>{`of ${paging.pageCount}`}</span>
          <ui.IconButton
            iconName="ChevronRight"
            title="Next page"
            disabled={paging.page >= paging.pageCount - 1}
            onClick={() => paging.onPage(paging.page + 1)}
          />
        </span>
      ) : null}
      {paging ? (
        <ui.Dropdown
          label="Rows per page"
          value={paging.pageSize}
          options={paging.pageSizeOptions.map((n) => ({
            key: String(n),
            text: String(n),
            data: n,
          }))}
          onChange={(v) => paging.onPageSize(Number(v))}
        />
      ) : null}
    </div>
  );
}
