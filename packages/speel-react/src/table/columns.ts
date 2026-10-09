import type { ReactNode } from "react";
import type {
  EntityType,
  FieldConfig,
  FieldContext,
  TableFilterConfig,
} from "@speel/core";
import type { ColumnAlign } from "../adapter/SpeelUIAdapter.js";
import { formatFieldValue } from "../fields/format.js";
import { comparatorFor, type Comparator } from "./sort.js";
import { defaultFilterFor } from "./filter/defaults.js";
import { defaultFlexFor, defaultWidthFor } from "./defaultWidth.js";

/** Every column option except `key` — what `p.Field.with(...)` takes. */
export interface ColumnOptions<T> {
  header?: string;
  /** Rendered in the header cell in place of `header`'s text. `header` still names the
   *  column everywhere else — export, the column chooser, filter chips, hover titles. */
  headerContent?: ReactNode;
  render?: (row: T) => ReactNode;
  /** The column's starting width (CSS `flex-basis`). Defaults by field kind. */
  width?: number;
  /** Share of a table's spare width (CSS `flex-grow`). Defaults by field kind. */
  grow?: number;
  /** Share of a table's shortfall, scaled by width (CSS `flex-shrink`). Defaults by field kind. */
  shrink?: number;
  /** Narrowest the table's layout may make this column. Defaults to its header's longest word. */
  minWidth?: number;
  /** Widest the table's layout may make this column. */
  maxWidth?: number;
  /** Break long values onto more lines, at spaces, instead of cutting them off. */
  wrap?: boolean;
  /** Header and cell alignment. Default "start". */
  align?: ColumnAlign;
  /** `false` opts the column out of the hover title a cut-off cell shows. */
  cellTitle?: false;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | Date | boolean;
  tableFilter?: TableFilterConfig;
  filterValue?: (row: T) => unknown;
  /** The text this column exports to CSV. Wins over everything the exporter can infer. */
  exportValue?: (row: T) => string | number | Date | boolean | null | undefined;
}
export interface ColumnDescriptor<T> extends ColumnOptions<T> {
  key: string;
}
export type ColumnSpec<T> = string | ColumnDescriptor<T>;

/** A field column picked through the `columns` callback: `p.Title`, or `p.Title.with({...})`. */
export interface ColumnRef<T> {
  readonly key: string;
  /** This field's column with options — a width, a header, a render — still keyed to the field. */
  with(options: ColumnOptions<T>): ColumnDescriptor<T>;
}

/** The keys of `T` that hold data — methods are not columns. */
type DataKeys<T> = {
  [K in keyof T & string]-?: T[K] extends (...args: never[]) => unknown
    ? never
    : K;
}[keyof T & string];

/** What the `columns` callback receives: one column ref per data property of the entity. */
export type ColumnRefs<T> = { readonly [K in DataKeys<T>]-?: ColumnRef<T> };

export interface ResolvedColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: number;
  /** The width the column starts from when nobody has given it one — `defaultWidthFor`. */
  defaultWidth?: number;
  /** Share of the table's spare width (CSS `flex-grow`). */
  grow?: number;
  /** Share of the table's shortfall (CSS `flex-shrink`). */
  shrink?: number;
  /** Narrowest the layout may make the column. */
  minWidth?: number;
  /** Widest the layout may make the column. */
  maxWidth?: number;
  /** Break long values onto more lines instead of cutting them off. */
  wrap?: boolean;
  /** Header and cell alignment; absent means start. */
  align?: ColumnAlign;
  /** `false` when the column opted out of the cut-off hover title. */
  cellTitle?: false;
  /** Shown in the header cell in place of `header`'s text. */
  headerContent?: ReactNode;
  sortable: boolean;
  sortAccessor?: (row: T) => unknown;
  comparator?: Comparator;
  filter?: {
    config: TableFilterConfig;
    fieldConfig?: FieldConfig;
    getValue: (row: T) => unknown;
  };
  exportValue?: (row: T) => string | number | Date | boolean | null | undefined;
  /** Present when the column is backed by a model field — the exporter's last resort. */
  field?: { config: FieldConfig; raw: (row: T) => unknown };
}

/** The common shape of Property | INavigation used for cell rendering + sort/filter. */
interface Field {
  config: FieldConfig;
  displayName: string;
  render?: (ctx: FieldContext) => unknown;
  tableFilter?: TableFilterConfig;
}

const COL_REF = Symbol("speelColumnRef");
/** The runtime shape of a `ColumnRef`, branded so `resolveColumns` can tell it from a descriptor. */
interface BrandedRef<T> extends ColumnRef<T> {
  [COL_REF]: true;
}
function isColumnRef(x: unknown): x is BrandedRef<unknown> {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as Record<symbol, unknown>)[COL_REF] === true
  );
}
function isDescriptor<T>(x: unknown): x is ColumnDescriptor<T> {
  return (
    typeof x === "object" &&
    x !== null &&
    !isColumnRef(x) &&
    typeof (x as { key?: unknown }).key === "string"
  );
}

function fieldFor(et: EntityType, key: string): Field | undefined {
  return (
    (et.findProperty(key) as Field | undefined) ??
    (et.findNavigation(key) as unknown as Field | undefined)
  );
}

function cellFor<T>(field: Field, key: string): (row: T) => ReactNode {
  return (row: T): ReactNode => {
    const values = row as unknown as Record<string, unknown>;
    const ctx: FieldContext = {
      values,
      value: values[key],
      mode: "table-view",
    };
    const overridden = field.render ? field.render(ctx) : undefined;
    return overridden !== undefined
      ? (overridden as ReactNode)
      : formatFieldValue(field.config, ctx.value);
  };
}

/**
 * Sort/filter metadata for a column backed by a model field.
 *
 * A descriptor's `sortValue` / `filterValue` substitute the *value* the column sorts and
 * filters on (a masked status, say) but not the field's *semantics*: the comparator and
 * the `fieldConfig` handed to the filter UI stay field-derived, so the inherited control
 * still renders and still interprets the substituted value the way the field would.
 */
function fieldMeta<T>(
  field: Field,
  key: string,
  override?: ColumnDescriptor<T>,
): {
  sortable: boolean;
  sortAccessor: (row: T) => unknown;
  comparator: Comparator;
  filter?: {
    config: TableFilterConfig;
    fieldConfig?: FieldConfig;
    getValue: (row: T) => unknown;
  };
  field: { config: FieldConfig; raw: (row: T) => unknown };
} {
  const raw = (row: T): unknown =>
    (row as unknown as Record<string, unknown>)[key];
  const getValue = override?.filterValue ?? raw;
  const fc =
    override?.tableFilter ??
    field.tableFilter ??
    defaultFilterFor(field.config);
  return {
    // A shape has no honest comparator, so a Json field is never sortable —
    // a column override cannot turn that back on.
    sortable: override?.sortable !== false && field.config.kind !== "Json",
    sortAccessor: override?.sortValue ?? raw,
    comparator: comparatorFor(field.config),
    ...(fc.kind === "none"
      ? {}
      : { filter: { config: fc, fieldConfig: field.config, getValue } }),
    field: { config: field.config, raw },
  };
}

function autoColumn<T>(et: EntityType, key: string): ResolvedColumn<T> {
  const field = fieldFor(et, key);
  if (!field)
    throw new Error(
      `SpeelTable: '${key}' is not a property or navigation of ${et.ctor.name} — give the column a render().`,
    );
  return {
    key,
    header: field.displayName,
    render: cellFor<T>(field, key),
    defaultWidth: defaultWidthFor(field.config),
    ...flexFor<T>(field.config),
    ...fieldMeta<T>(field, key),
  };
}

/** grow/shrink from the descriptor, else the field kind's default; min/max only when given. */
function flexFor<T>(
  config: FieldConfig | undefined,
  d?: ColumnDescriptor<T>,
): Pick<ResolvedColumn<T>, "grow" | "shrink" | "minWidth" | "maxWidth"> {
  const kind = defaultFlexFor(config);
  return {
    grow: d?.grow ?? kind.grow,
    shrink: d?.shrink ?? kind.shrink,
    ...(d?.minWidth !== undefined ? { minWidth: d.minWidth } : {}),
    ...(d?.maxWidth !== undefined ? { maxWidth: d.maxWidth } : {}),
  };
}

function descriptorColumn<T>(
  et: EntityType,
  d: ColumnDescriptor<T>,
): ResolvedColumn<T> {
  const field = fieldFor(et, d.key);
  const render = d.render ?? (field ? cellFor<T>(field, d.key) : undefined);
  if (!render)
    throw new Error(
      `SpeelTable column '${d.key}' is not a field and has no render().`,
    );

  const base: ResolvedColumn<T> = {
    key: d.key,
    header: d.header ?? field?.displayName ?? d.key,
    render,
    defaultWidth: defaultWidthFor(field?.config),
    ...flexFor<T>(field?.config, d),
    ...(d.width !== undefined ? { width: d.width } : {}),
    ...(d.exportValue !== undefined ? { exportValue: d.exportValue } : {}),
    ...(d.wrap ? { wrap: true } : {}),
    ...(d.align !== undefined && d.align !== "start" ? { align: d.align } : {}),
    ...(d.cellTitle === false ? { cellTitle: false as const } : {}),
    ...(d.headerContent !== undefined
      ? { headerContent: d.headerContent }
      : {}),
    sortable: false,
  };

  if (field) return { ...base, ...fieldMeta<T>(field, d.key, d) };

  // Custom (non-field) column: inert unless accessors are supplied.
  const sortable = d.sortable !== false && d.sortValue !== undefined;
  const filter =
    d.tableFilter && d.tableFilter.kind !== "none" && d.filterValue
      ? { config: d.tableFilter, getValue: d.filterValue }
      : undefined;
  return {
    ...base,
    sortable,
    ...(sortable
      ? { sortAccessor: d.sortValue!, comparator: comparatorFor(undefined) }
      : {}),
    ...(filter ? { filter } : {}),
  };
}

/** Default columns: visible properties (minus key + nav-FK), then visible navigations. */
function defaultColumns<T>(et: EntityType): ResolvedColumn<T>[] {
  const fkCols = new Set(
    et.navigations().map((n) => n.foreignKey.propertyName),
  );
  const cols: ResolvedColumn<T>[] = [];
  for (const p of et.properties) {
    // Literal false = hidden everywhere (forms AND default table columns).
    // Function-valued isVisible is a per-entity form predicate — a column-level
    // decision can't evaluate it per row, so those stay in the defaults.
    if (p.key || p.visible === false || fkCols.has(p.propertyName)) continue;
    cols.push({
      key: p.propertyName,
      header: p.displayName,
      render: cellFor<T>(p as Field, p.propertyName),
      defaultWidth: defaultWidthFor(p.config),
      ...flexFor<T>(p.config),
      ...fieldMeta<T>(p as Field, p.propertyName),
    });
  }
  for (const n of et.navigations()) {
    // Same literal-false rule the properties above follow — an invisible nav
    // (SpeelDocument's CheckedOutBy, or one a model author hid) stays
    // out of the defaults. Explicit column specs can still name it.
    if (n.visible === false) continue;
    const nav = n as unknown as Field;
    cols.push({
      key: n.name,
      header: n.displayName,
      render: cellFor<T>(nav, n.name),
      defaultWidth: defaultWidthFor(nav.config),
      ...flexFor<T>(nav.config),
      ...fieldMeta<T>(nav, n.name),
    });
  }
  return cols;
}

/**
 * What a filter or sort key resolves to: a column's overrides, or the model's own defaults.
 * The shape is `ResolvedColumn` minus rendering — everything sorting and filtering consume.
 */
export interface ResolvedKeyTarget<T> {
  /** Column header, else the field's display name — what a filter chip is labelled with. */
  displayName: string;
  sortable: boolean;
  sortAccessor?: (row: T) => unknown;
  comparator?: Comparator;
  filter?: {
    config: TableFilterConfig;
    fieldConfig?: FieldConfig;
    getValue: (row: T) => unknown;
  };
}

/**
 * Resolve one filter/sort key: the column that carries it, else the entity field it names.
 *
 * The model defines default behaviour and a column descriptor overrides it — so a key with no
 * column is not a miss while the model still answers it. A view may filter or sort on a field
 * the table never displays, and nobody has to define a column to make a saved view true.
 * Matching runs against the FULL resolved list, hidden columns included: hiding a filtered
 * column must not widen the result set.
 */
export function resolveKeyTarget<T>(
  et: EntityType,
  columns: readonly ResolvedColumn<T>[],
  key: string,
): ResolvedKeyTarget<T> | null {
  const col = columns.find((c) => c.key === key);
  if (col) {
    return {
      displayName: col.header,
      sortable: col.sortable,
      ...(col.sortAccessor !== undefined
        ? { sortAccessor: col.sortAccessor }
        : {}),
      ...(col.comparator !== undefined ? { comparator: col.comparator } : {}),
      ...(col.filter !== undefined ? { filter: col.filter } : {}),
    };
  }
  const field = fieldFor(et, key);
  if (!field) return null;
  const meta = fieldMeta<T>(field, key);
  return {
    displayName: field.displayName,
    sortable: meta.sortable,
    sortAccessor: meta.sortAccessor,
    comparator: meta.comparator,
    ...(meta.filter !== undefined ? { filter: meta.filter } : {}),
  };
}

function columnProxy<T>(): ColumnRefs<T> {
  return new Proxy(
    {},
    {
      get(_t, prop): unknown {
        if (typeof prop === "symbol") return undefined;
        const ref: BrandedRef<T> = {
          [COL_REF]: true,
          key: prop,
          // A plain descriptor, unbranded, so it resolves down the descriptor path with its
          // options intact. `key` last: the ref's field wins over anything smuggled in.
          with: (options) => ({ ...options, key: prop }),
        };
        return ref;
      },
    },
  ) as ColumnRefs<T>;
}

/** Resolve `columns` (default / array / proxy-accessor) into render-ready columns. */
export function resolveColumns<T>(
  et: EntityType,
  columns: ColumnSpec<T>[] | ((p: ColumnRefs<T>) => unknown[]) | undefined,
): ResolvedColumn<T>[] {
  if (!columns) return defaultColumns<T>(et);
  const list =
    typeof columns === "function" ? columns(columnProxy<T>()) : columns;
  return list.map((item): ResolvedColumn<T> => {
    if (typeof item === "string") return autoColumn<T>(et, item);
    if (isColumnRef(item)) return autoColumn<T>(et, item.key);
    if (isDescriptor<T>(item)) return descriptorColumn<T>(et, item);
    throw new Error(
      "SpeelTable: invalid column spec (expected a property name or a { key, render } descriptor).",
    );
  });
}
