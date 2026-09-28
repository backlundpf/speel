import type { ResolvedColumn } from "./columns.js";

export interface ColumnStateEntry {
  key: string;
  hidden?: boolean;
  width?: number;
}

/** Array order is display order. Sparse in everything but `key`. */
export type ColumnState = ColumnStateEntry[];

export interface ArrangedColumn<T> {
  column: ResolvedColumn<T>;
  hidden: boolean;
  width?: number;
}

/**
 * Every column in display order, carrying its overlay flags.
 *
 * The `columns` prop stays the source of truth for which columns *exist*; the state is a
 * sparse overlay on top. So: entries naming a column that no longer exists are dropped
 * silently — this is user data that outlives the schema it was written against, unlike a
 * developer-authored filter set, where a bad key throws — and columns the state has
 * never seen are appended in prop order, where they are easy to find and easy to move,
 * rather than interleaved at their prop position, which would shuffle a user's arrangement
 * under them.
 */
export function arrangeColumns<T>(
  columns: readonly ResolvedColumn<T>[],
  state: ColumnState,
): ArrangedColumn<T>[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const taken = new Set<string>();
  const arranged: ArrangedColumn<T>[] = [];

  for (const entry of state) {
    const column = byKey.get(entry.key);
    if (!column || taken.has(entry.key)) continue;
    taken.add(entry.key);
    arranged.push({
      column,
      hidden: entry.hidden === true,
      ...(entry.width !== undefined ? { width: entry.width } : {}),
    });
  }
  for (const column of columns) {
    if (taken.has(column.key)) continue;
    arranged.push({ column, hidden: false });
  }
  return arranged;
}

/** The columns the table renders and exports: visible only, state width applied. */
export function visibleColumns<T>(
  arranged: readonly ArrangedColumn<T>[],
): ResolvedColumn<T>[] {
  return arranged
    .filter((a) => !a.hidden)
    .map((a) =>
      a.width === undefined ? a.column : { ...a.column, width: a.width },
    );
}

/** A complete state for the current arrangement — every known key, in display order. */
function emit<T>(arranged: readonly ArrangedColumn<T>[]): ColumnState {
  return arranged.map((a) => ({
    key: a.column.key,
    ...(a.hidden ? { hidden: true } : {}),
    ...(a.width !== undefined ? { width: a.width } : {}),
  }));
}

export function toggleColumn<T>(
  arranged: readonly ArrangedColumn<T>[],
  key: string,
): ColumnState {
  return emit(
    arranged.map((a) =>
      a.column.key === key ? { ...a, hidden: !a.hidden } : a,
    ),
  );
}

export function moveColumn<T>(
  arranged: readonly ArrangedColumn<T>[],
  key: string,
  toIndex: number,
): ColumnState {
  const from = arranged.findIndex((a) => a.column.key === key);
  if (from === -1) return emit(arranged);
  const to = Math.max(0, Math.min(arranged.length - 1, toIndex));
  const next = [...arranged];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return emit(next);
}
