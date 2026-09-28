import { useMemo, useRef, useState } from "react";
import type { EntityType } from "@speel/core";
import type { TableSort } from "../adapter/SpeelUIAdapter.js";
import { resolveKeyTarget, type ResolvedColumn } from "./columns.js";
import type { FilterState } from "./filter/FilterBar.js";
import { matches, type FilterCriteria } from "./filter/match.js";
import { applySort } from "./sort.js";
import {
  arrangeColumns,
  visibleColumns,
  type ColumnState,
} from "./columnState.js";
import { cellText } from "./cellText.js";

export interface TableStateOptions<T> {
  items: readonly T[];
  /** The entity behind the table: filter and sort keys fall back to its fields. */
  et: EntityType;
  columns: readonly ResolvedColumn<T>[];
  sortable: boolean;
  filterable: boolean;
  pageSize?: number;
  tableState?: TableState;
  defaultTableState?: TableState;
  onTableStateChange?: (next: TableState) => void;
  /** What the page says this table is about. Applied only where the user is silent. */
  scopeFilters?: FilterState;
  /** Filter sets arriving from elsewhere, each carrying how loudly a bad key should fail. */
  filterOrigins?: readonly FilterOrigin[];
}

/**
 * Where a set of filters came from — and therefore how loudly a key that names nothing fails.
 *
 * Developer-authored filters (props, the app's own default view) are versioned with the model,
 * so a miss is a bug and throws at mount. Filters the *user* carries — a saved view, a pasted
 * URL — outlive the schema they were written against, so a miss warns once and is ignored
 * while the keys that still resolve keep filtering.
 */
export interface FilterOrigin {
  /** Names the source in the message: `scope filter`, `default view 'Current FY' filter`. */
  label: string;
  loudness: "throw" | "warn";
  /** Names the table in a warning. Defaults to the entity. */
  tableId?: string;
  filters?: FilterState;
}

/** Everything a user can adjust about a table, as one value. */
export interface TableState {
  columns: ColumnState;
  sort?: TableSort;
  filters?: FilterState;
  pageSize?: number;
  page?: number;
  /** Scope keys the user explicitly dismissed — see `scope` on SpeelTable. */
  clearedScope?: string[];
  /** The universal search text, matched against every visible column's cell text. */
  search?: string;
}

/** What the hook hands back: the state value plus every derivation and setter over it. */
export interface TableApi<T> {
  sort: TableSort | undefined;
  onSortChange: (key: string) => void;
  /** The user's own criteria — what a view would save. */
  filters: FilterState;
  /** What rows are actually matched against: the user's criteria over the app's scope. */
  effectiveFilters: FilterState;
  /** Which effective keys came from scope and are not overridden — chip provenance. */
  scopeKeys: string[];
  setFilter: (key: string, c: FilterCriteria | undefined) => void;
  setFilters: (next: FilterState) => void;
  /** Clears one chip, routing by provenance: a scope chip records a dismissal instead. */
  clearFilter: (key: string) => void;
  /** Clears every chip, scope included, and the search. */
  clearAllFilters: () => void;
  /** The search text as typed. */
  search: string;
  /** Does the search constrain anything — i.e. is there at least one term in it? */
  searchActive: boolean;
  setSearch: (q: string) => void;
  /** The effective state, controlled or internal. */
  tableState: TableState;
  /** Commit a whole next state: updates internal state when uncontrolled, always reports. */
  commit: (next: TableState) => void;
  columnState: ColumnState;
  setColumnState: (next: ColumnState) => void;
  onColumnResize: (key: string, width: number) => void;
  /** Live resizes, keyed by column. Session-only: never part of TableState, never persisted. */
  sessionWidths: Record<string, number>;
  page: number;
  setPage: (p: number) => void;
  pageSize: number | undefined;
  setPageSize: (n: number) => void;
  pageCount: number;
  total: number;
  /** Every row passing the filters, in sort order. */
  matched: readonly T[];
  /** The rows handed to the adapter. */
  displayed: readonly T[];
}

/**
 * A filter that silently does nothing is miserable to debug — the table merely looks
 * unfiltered, and a chip can read "Fiscal Year: 2026" while scoping nothing. So every filter
 * set is checked where it ENTERS the table rather than per row, and the volume follows
 * authorship: see `FilterOrigin`.
 */
function validateFilterOrigins<T>(
  et: EntityType,
  columns: readonly ResolvedColumn<T>[],
  filterable: boolean,
  origins: readonly FilterOrigin[],
  warned: Set<string>,
): void {
  for (const origin of origins) {
    const filters = origin.filters ?? {};
    const keys = Object.keys(filters);
    if (keys.length === 0) continue;
    if (!filterable) {
      // User-carried state riding into a non-filterable table is the app's doing, not theirs.
      if (origin.loudness === "warn") continue;
      throw new Error(
        `SpeelTable: ${origin.label} was supplied with filterable={false} — filters are inert when filtering is off.`,
      );
    }
    for (const key of keys) {
      const target = resolveKeyTarget<T>(et, columns, key);
      const problem = !target
        ? "matches no column or model field"
        : !target.filter
          ? "is not filterable"
          : undefined;
      // The entity names itself in the throw, where the reader is the developer who typed the
      // key; a warning is already namespaced by the table it came from.
      const on = target ? "" : ` on ${et.ctor.name}`;
      if (problem === undefined) {
        // Authored criteria are also checked against the filter they will be handed to; a
        // saved view's mismatched kind is stale user data, which `matches` simply fails.
        // The check may not be stricter than the matcher: `matches` dispatches on the
        // CRITERIA's kind, and a select criteria against a text-filtering target is exact
        // set-membership over strings — legitimate authored intent (years, codes). Every
        // other cross-kind pairing still reads as a typo and throws.
        if (origin.loudness === "throw") {
          const expected = target!.filter!.config.kind;
          const got = filters[key]!.kind;
          const compatible =
            expected === got || (expected === "text" && got === "select");
          if (!compatible) {
            throw new Error(
              `SpeelTable: ${origin.label} '${key}' is a '${got}' criteria but it filters by '${expected}'.`,
            );
          }
        }
        continue;
      }
      if (origin.loudness === "throw") {
        throw new Error(
          `SpeelTable: ${origin.label} key '${key}' ${problem}${on}.`,
        );
      }
      // Deduped on the key alone: a dead key the user carries reaches the table by whatever
      // route the session takes (a view, then the URL that view's question was written to),
      // and saying the same thing twice about one key helps nobody.
      if (warned.has(key)) continue;
      warned.add(key);
      // eslint-disable-next-line no-console
      console.warn(
        `[speel] table '${origin.tableId ?? et.ctor.name}': ${origin.label} key '${key}' ${problem} — ignored.`,
      );
    }
  }
}

/**
 * Every piece of user-adjustable table state, and the derivations over it.
 *
 * `matched` and `displayed` are both returned because export and the pager's total need the
 * full filtered-and-sorted set while the adapter receives only the visible slice. Computing
 * them in one place is what keeps them from drifting.
 */
export function useTableState<T>(o: TableStateOptions<T>): TableApi<T> {
  const { items, et, columns, sortable, filterable } = o;

  // One Set per mounted table: a warning about a dead key is worth saying once, not once per
  // render, and never so globally that a second table on the page stays silent about its own.
  const warned = useRef<Set<string>>(new Set());
  validateFilterOrigins(
    et,
    columns,
    filterable,
    [
      ...(o.scopeFilters !== undefined
        ? [
            {
              label: "scope filter",
              loudness: "throw" as const,
              filters: o.scopeFilters,
            },
          ]
        : []),
      ...(o.defaultTableState?.filters !== undefined
        ? [
            {
              label: "defaultTableState filter",
              loudness: "throw" as const,
              filters: o.defaultTableState.filters,
            },
          ]
        : []),
      ...(o.filterOrigins ?? []),
    ],
    warned.current,
  );

  // Controlled when `tableState` is supplied, internal otherwise — the standard React
  // duality, and what the views hook needs in order to own the value.
  const controlled = o.tableState !== undefined;
  const [internal, setInternal] = useState<TableState>(() => {
    const seedFilters = o.defaultTableState?.filters;
    const seedSort = o.defaultTableState?.sort;
    const seedPageSize = o.defaultTableState?.pageSize ?? o.pageSize;
    return {
      columns: o.defaultTableState?.columns ?? [],
      ...(seedSort !== undefined ? { sort: seedSort } : {}),
      ...(seedFilters !== undefined ? { filters: { ...seedFilters } } : {}),
      ...(seedPageSize !== undefined ? { pageSize: seedPageSize } : {}),
    };
  });
  const state = controlled ? o.tableState! : internal;

  // Reports in BOTH modes, so an app can persist without owning the value.
  const commit = (next: TableState): void => {
    if (!controlled) setInternal(next);
    o.onTableStateChange?.(next);
  };

  const sort = state.sort;
  const filters = state.filters ?? {};
  const search = state.search ?? "";
  const pageSize = state.pageSize ?? (controlled ? o.pageSize : undefined);
  const page = state.page ?? 0;
  const columnState = state.columns;

  const setColumnState = (next: ColumnState): void =>
    commit({ ...state, columns: next });

  // A resize is presentation of the moment — it never enters TableState, so it cannot
  // dirty a view, prompt a save, or write through. It lives and dies with the mount.
  const [sessionWidths, setSessionWidths] = useState<Record<string, number>>(
    {},
  );
  const onColumnResize = (key: string, width: number): void =>
    setSessionWidths((prev) => ({ ...prev, [key]: Math.round(width) }));

  // Every page reset is part of the setter that causes it: no effects, so a reload never
  // flickers through page 1 and the rules stay readable in one place.
  const setFilter = (key: string, c: FilterCriteria | undefined): void => {
    const next = { ...filters };
    if (c) next[key] = c;
    else delete next[key];
    commit({ ...state, filters: next, page: 0 });
  };

  const setFilters = (next: FilterState): void =>
    commit({ ...state, filters: next, page: 0 });

  const setSearch = (q: string): void =>
    commit({ ...state, search: q, page: 0 });

  const onSortChange = (key: string): void => {
    const next: TableSort =
      sort && sort.key === key
        ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" };
    commit({ ...state, sort: next, page: 0 });
  };

  const setPageSize = (n: number): void =>
    commit({ ...state, pageSize: n, page: 0 });
  const setPage = (p: number): void => commit({ ...state, page: p });

  // Scope applies only where the user has said nothing and has not dismissed it. The user's
  // own criteria on a column simply wins — locking a column they could override by selecting
  // every value would be removal with extra steps.
  const dismissed = state.clearedScope ?? [];
  const scopeKeys = Object.entries(o.scopeFilters ?? {})
    .filter(([key]) => filters[key] === undefined && !dismissed.includes(key))
    .map(([key]) => key);
  const effectiveFilters = useMemo<FilterState>(() => {
    const out: FilterState = { ...filters };
    for (const key of scopeKeys) out[key] = o.scopeFilters![key]!;
    return out;
  }, [state.filters, o.scopeFilters, state.clearedScope]);

  const clearFilter = (key: string): void => {
    if (scopeKeys.includes(key)) {
      commit({ ...state, clearedScope: [...dismissed, key], page: 0 });
      return;
    }
    setFilter(key, undefined);
  };

  // "Clear all" means what it says, scope and search included. Reset is the way back, since
  // it drops the dismissals along with everything else.
  const clearAllFilters = (): void =>
    commit({
      ...state,
      filters: {},
      search: "",
      clearedScope: [...dismissed, ...scopeKeys],
      page: 0,
    });

  // Search reads what the user sees: the VISIBLE columns, as the text each cell displays —
  // the same text export writes and print prints — so a masked column is found by its mask
  // and a hidden column's values are not found at all. Every whitespace-separated term must
  // appear somewhere in the row.
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searchActive = terms.length > 0;
  const searchColumns = useMemo(
    () => visibleColumns(arrangeColumns(columns, columnState)),
    [columns, columnState],
  );
  // One lower-cased string per row, built once per data/column change rather than once per
  // keystroke: a keystroke then costs a substring test per row, not a cell walk per row.
  const haystacks = useMemo<readonly string[] | undefined>(
    () =>
      searchActive
        ? items.map((row) =>
            searchColumns
              .map((c) => cellText(c, row))
              .join("\n")
              .toLowerCase(),
          )
        : undefined,
    [items, searchColumns, searchActive],
  );

  const matched = useMemo<readonly T[]>(() => {
    const active = Object.entries(effectiveFilters);
    // Keys resolve once per pass, not once per row: a model-resolved key would otherwise
    // walk the entity's properties for every row on the page.
    const applicable = active
      .map(
        ([key, criteria]) =>
          [resolveKeyTarget<T>(et, columns, key), criteria] as const,
      )
      .filter(([target]) => target?.filter !== undefined);
    const filtering = filterable && applicable.length > 0;
    // One pass over `items` — the haystacks are indexed by position in it — and the array
    // itself when nothing constrains, so an unfiltered table keeps its identity.
    const kept =
      !filtering && !haystacks
        ? items
        : items.filter(
            (row, i) =>
              (!filtering ||
                applicable.every(([target, criteria]) =>
                  matches(
                    target!.filter!.fieldConfig,
                    criteria,
                    target!.filter!.getValue(row),
                  ),
                )) &&
              (!haystacks || terms.every((t) => haystacks[i]!.includes(t))),
          );
    if (!sortable || !sort) return kept;
    const on = resolveKeyTarget<T>(et, columns, sort.key);
    if (!on?.sortable || !on.sortAccessor || !on.comparator) return kept;
    return applySort(kept, on.sortAccessor, on.comparator, sort.direction);
  }, [
    items,
    et,
    columns,
    effectiveFilters,
    filterable,
    sortable,
    sort,
    haystacks,
    search,
  ]);

  const total = matched.length;
  const pageCount = pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  // Clamped during render, so a reload that shrinks the set lands on the new last page
  // rather than on a blank one.
  const safePage = Math.min(page, pageCount - 1);
  const displayed = useMemo<readonly T[]>(
    () =>
      pageSize
        ? matched.slice(safePage * pageSize, safePage * pageSize + pageSize)
        : matched,
    [matched, pageSize, safePage],
  );

  return {
    sort,
    onSortChange,
    filters,
    effectiveFilters,
    scopeKeys,
    setFilter,
    setFilters,
    clearFilter,
    clearAllFilters,
    search,
    searchActive,
    setSearch,
    tableState: state,
    commit,
    columnState,
    setColumnState,
    onColumnResize,
    sessionWidths,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    total,
    matched,
    displayed,
  };
}
