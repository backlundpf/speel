import type { ReactNode } from "react";
import type { EntityType } from "@speel/core";
import {
  columnProxy,
  isColumnRef,
  resolveColumns,
  resolveKeyTarget,
  type ColumnRef,
  type ColumnRefs,
  type ResolvedColumn,
} from "./columns.js";
import { cellText, isoDate } from "./cellText.js";
import { isEmptyValue } from "./fieldValue.js";
import { naturalCompare } from "./sort.js";

/** One level of grouping: a column, or a computed value. */
export interface GroupDescriptor<T> {
  /** A column key; with `by`, purely the level's id (no column binding, even if it matches one). */
  key: string;
  /** The value rows are grouped on. Absent = the column's sort value. */
  by?: (row: T) => unknown;
  /** The group's text. Absent = the column's display text (what search and export read). */
  label?: (value: unknown) => string;
  /** Replaces the default header ("Status: Open (12)"), count included. */
  header?: (group: RowGroup<T>) => ReactNode;
  /** Starting state. Absent = expanded. */
  collapsed?: boolean | ((group: RowGroup<T>) => boolean);
  /** Group order. Absent = ascending by value, blanks last. */
  order?: "asc" | "desc" | ((a: unknown, b: unknown) => number);
}

/** A level of `groupBy`: a field name, a column ref (`p.Status`), or a descriptor. */
export type GroupSpec<T> = string | ColumnRef<T> | GroupDescriptor<T>;

/** What `header` and `collapsed` are handed. */
export interface RowGroup<T> {
  /** Stable path id, e.g. "Status=Open/Owner=Jane Doe". */
  id: string;
  /** 0 = the outermost level. */
  level: number;
  value: unknown;
  /** The group's text; "" for the blank group. */
  label: string;
  /** Matched rows under this group, across every subgroup. */
  count: number;
  rows: readonly T[];
  parent?: RowGroup<T>;
}

/** A group with its place in the grouped row list. */
export interface GroupNode<T> extends RowGroup<T> {
  /** Where the group's rows start in `GroupedRows.rows`. */
  startIndex: number;
  /** Empty at the innermost level. */
  children: GroupNode<T>[];
}

/** One resolved level of `groupBy`. */
export interface GroupLevel<T> {
  key: string;
  /** Column header / field display name; absent for a `by` level. Prefixes the default header. */
  title?: string;
  value: (row: T) => unknown;
  /** The group text for a row; "" is the blank group. */
  label: (row: T, value: unknown) => string;
  /** Compares two non-blank group values. */
  compare: (a: unknown, b: unknown) => number;
  direction: "asc" | "desc";
  header?: (g: RowGroup<T>) => ReactNode;
  collapsed?: boolean | ((g: RowGroup<T>) => boolean);
}

export interface GroupedRows<T> {
  /** Every row, in grouped order: group path first, then the input's own order. */
  rows: T[];
  roots: GroupNode<T>[];
}

function valueText(v: unknown): string {
  if (isEmptyValue(v)) return "";
  if (v instanceof Date) return isoDate(v);
  return String(v);
}

function resolveLevel<T>(
  et: EntityType,
  columns: readonly ResolvedColumn<T>[],
  spec: GroupSpec<T>,
): GroupLevel<T> {
  const d: GroupDescriptor<T> =
    typeof spec === "string"
      ? { key: spec }
      : isColumnRef(spec)
        ? { key: spec.key }
        : (spec as GroupDescriptor<T>);
  const direction = typeof d.order === "string" ? d.order : "asc";
  const custom = typeof d.order === "function" ? d.order : undefined;
  const common = {
    key: d.key,
    direction,
    ...(d.header !== undefined ? { header: d.header } : {}),
    ...(d.collapsed !== undefined ? { collapsed: d.collapsed } : {}),
  } as const;

  if (d.by) {
    const label = d.label;
    return {
      ...common,
      value: d.by,
      label: (_row, v) => (label ? label(v) : valueText(v)),
      compare: custom ?? naturalCompare,
    };
  }

  // The full resolved list holds hidden columns too, so grouping by a column the user has
  // hidden keeps working. A field with no column gets the column it would have had.
  let col = columns.find((c) => c.key === d.key);
  if (!col && resolveKeyTarget(et, columns, d.key))
    col = resolveColumns<T>(et, [d.key])[0];
  if (!col)
    throw new Error(
      `SpeelTable: groupBy key '${d.key}' names no column or field of ${et.ctor.name}. ` +
        "Give it a `by` to group on a computed value.",
    );
  const c = col;
  // A column groups on what it sorts on — a masked column on its mask. One with nothing to
  // sort on groups on its text.
  const value = c.sortAccessor ?? ((row: T) => cellText(c, row));
  const label = d.label;
  return {
    ...common,
    title: c.header,
    value,
    label: (row, v) => (label ? label(v) : cellText(c, row)),
    compare: custom ?? c.comparator ?? naturalCompare,
  };
}

/** Resolve `groupBy` into levels, outermost first. Throws on a key that names nothing. */
export function resolveGroupLevels<T>(
  et: EntityType,
  columns: readonly ResolvedColumn<T>[],
  groupBy: GroupSpec<T>[] | ((p: ColumnRefs<T>) => GroupSpec<T>[]),
): GroupLevel<T>[] {
  const list =
    typeof groupBy === "function" ? groupBy(columnProxy<T>()) : groupBy;
  return list.map((spec) => resolveLevel(et, columns, spec));
}

const escapeId = (s: string): string => s.replace(/[\\/=]/g, (m) => `\\${m}`);

interface Bucket<T> {
  label: string;
  rows: T[];
  value: unknown;
}

function build<T>(
  rows: readonly T[],
  levels: readonly GroupLevel<T>[],
  depth: number,
  parent: GroupNode<T> | undefined,
  out: T[],
): GroupNode<T>[] {
  const level = levels[depth]!;
  // Identity is the label: rows that read the same share a group. Buckets keep first-seen
  // order and their rows keep input order, so the table's sort survives inside each group.
  const buckets = new Map<string, Bucket<T>>();
  for (const row of rows) {
    const v = level.value(row);
    const label = level.label(row, v);
    let b = buckets.get(label);
    if (!b) {
      b = { label, rows: [], value: undefined };
      buckets.set(label, b);
    }
    b.rows.push(row);
    if (label !== "" && !isEmptyValue(v))
      if (isEmptyValue(b.value) || level.compare(v, b.value) < 0) b.value = v;
  }
  const dir = level.direction === "asc" ? 1 : -1;
  const blank = (b: Bucket<T>): boolean =>
    b.label === "" || isEmptyValue(b.value);
  const ordered = [...buckets.values()].sort((x, y) => {
    const xb = blank(x);
    const yb = blank(y);
    if (xb || yb) return xb === yb ? 0 : xb ? 1 : -1;
    return dir * level.compare(x.value, y.value);
  });

  return ordered.map((b) => {
    const segment = `${escapeId(level.key)}=${escapeId(b.label)}`;
    const node: GroupNode<T> = {
      id: parent ? `${parent.id}/${segment}` : segment,
      level: depth,
      value: b.value,
      label: b.label,
      count: b.rows.length,
      rows: [],
      startIndex: out.length,
      children: [],
      ...(parent ? { parent } : {}),
    };
    if (depth + 1 < levels.length)
      node.children = build(b.rows, levels, depth + 1, node, out);
    else out.push(...b.rows);
    node.rows = out.slice(node.startIndex, node.startIndex + node.count);
    return node;
  });
}

/** Bucket already-sorted rows into the group tree, and list them in grouped order. */
export function groupRows<T>(
  rows: readonly T[],
  levels: readonly GroupLevel<T>[],
): GroupedRows<T> {
  const out: T[] = [];
  const roots = levels.length > 0 ? build(rows, levels, 0, undefined, out) : [];
  return { rows: levels.length > 0 ? out : [...rows], roots };
}

/** The group's text, or `(blank)` for the group of empty values. */
export function groupLabel<T>(g: RowGroup<T>): string {
  return g.label === "" ? "(blank)" : g.label;
}

/** "Status: Open (12)" for a column level, "Overdue (3)" for a `by` level. */
export function defaultGroupHeader<T>(
  level: GroupLevel<T>,
  g: RowGroup<T>,
): string {
  const text = `${groupLabel(g)} (${g.count})`;
  return level.title !== undefined ? `${level.title}: ${text}` : text;
}
