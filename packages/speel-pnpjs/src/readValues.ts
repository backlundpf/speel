// src/readValues.ts — SharePoint's REST JSON → the contract's typed values, per Property.
//
// The provider contract hands back typed values (ISO → Date, 0/1 → boolean,
// `{results:[…]}` → array, lookup id → number); core never sees the wire. A
// property describes one column by `columnName` and `config`; a column no property
// describes, or a read that passes none, comes back exactly as SharePoint sent it.
import {
  DataException,
  type FieldConfig,
  type IExpandClause,
  type Property,
} from "@speel/core";
import { inboundPersonExpand } from "./principalSources.js";

/** The two shapes a multi-value column arrives in: a bare array, or verbose OData's `{results}`. */
function unwrapMulti(raw: unknown, what: string, column: string): unknown[] {
  if (Array.isArray(raw)) return [...raw];
  if (
    raw !== null &&
    typeof raw === "object" &&
    "results" in raw &&
    Array.isArray((raw as { results: unknown }).results)
  ) {
    return [...(raw as { results: unknown[] }).results];
  }
  throw new DataException(
    `Column ${column} received unrecognized multi-value ${what} shape.`,
  );
}

function toId(raw: unknown, column: string): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    throw new DataException(
      `Column ${column} received non-numeric lookup id: ${String(raw)}`,
    );
  }
  return n;
}

/**
 * One column's typed value. `null` stays `null` (a cleared column) and
 * `undefined` stays `undefined` (a key present without a value — `inboundRecord`
 * emits `Id: undefined` when the row carried neither spelling); the caller skips
 * absent keys. A value already typed (a `Date`, a number) passes through, so a
 * record that has been through here once is unchanged by a second pass.
 * `column` is the name errors report — a sub-record's carries its nav prefix.
 */
export function coerceValue(
  config: FieldConfig,
  raw: unknown,
  column: string,
): unknown {
  if (raw == null) return raw;
  switch (config.kind) {
    case "Text":
    case "Json":
      return String(raw);
    case "Number":
    case "Currency": {
      // Int64 columns (File/Length) arrive as strings; Number() covers them.
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) {
        throw new DataException(
          `Column ${column} received non-finite number: ${String(raw)}`,
        );
      }
      return n;
    }
    case "Boolean":
      if (typeof raw === "boolean") return raw;
      if (raw === 0 || raw === 1) return raw === 1;
      return Boolean(raw);
    case "DateTime": {
      const d = raw instanceof Date ? raw : new Date(raw as string);
      if (Number.isNaN(d.getTime())) {
        throw new DataException(
          `Column ${column} received invalid date: ${String(raw)}`,
        );
      }
      return d;
    }
    case "Choice":
      return config.multi
        ? unwrapMulti(raw, "choice", column).map(String)
        : String(raw);
    case "Lookup": {
      // A person column is a lookup whose target is provider-routed; its typed
      // value is the id(s) either way.
      if (config.multi)
        return unwrapMulti(raw, "lookup", column).map((v) => toId(v, column));
      return toId(raw, column);
    }
    default: {
      // Exhaustive by construction: adding a FieldConfig kind fails to compile
      // here until it gets a case. The throw covers a cast at runtime — an
      // unsupported kind is refused loudly, never passed through as undefined.
      const _never: never = config;
      throw new DataException(
        `Column ${column}: unsupported field kind '${(_never as { kind: string }).kind}'`,
      );
    }
  }
}

/**
 * Type a column that lives under an expanded navigation (SpeelDocument.FileSize is
 * 'File/Length'). The leaf is replaced in a COPY of each object along the path, so
 * the record handed in is never mutated. A missing link — a folder row has no File —
 * leaves the record alone: there is no value to type and none to invent.
 */
function coercePath(
  record: Record<string, unknown>,
  parts: readonly string[],
  config: FieldConfig,
  column: string,
): Record<string, unknown> {
  const [head, ...rest] = parts as [string, ...string[]];
  if (!(head in record)) return record;
  const cur = record[head];
  if (rest.length === 0) {
    return { ...record, [head]: coerceValue(config, cur, column) };
  }
  if (cur === null || cur === undefined || typeof cur !== "object")
    return record;
  return {
    ...record,
    [head]: coercePath(cur as Record<string, unknown>, rest, config, column),
  };
}

/** Rows under a nav column: one object, an array, or verbose OData's `{results}`. */
function expandedRows(
  sub: object,
): readonly Record<string, unknown>[] | undefined {
  if (Array.isArray(sub)) return sub as Record<string, unknown>[];
  if ("results" in sub && Array.isArray((sub as { results: unknown }).results))
    return (sub as { results: Record<string, unknown>[] }).results;
  return undefined;
}

/**
 * `coerceRecord` proper. `at` is the message prefix for this record's columns —
 * empty for a top-level record, `Author/` for the sub-record under that nav — so
 * an error names the value's place in the payload, not just its leaf.
 */
function typeRecord(
  record: Record<string, unknown>,
  properties: readonly Property[] | undefined,
  expand: readonly IExpandClause[] | undefined,
  at: string,
): Record<string, unknown> {
  const renames = expand?.some((e) => e.source?.kind === "provider") ?? false;
  if (
    !properties?.length &&
    !expand?.some((e) => e.properties?.length) &&
    !renames
  )
    return record;
  let out: Record<string, unknown> = { ...record };
  for (const p of properties ?? []) {
    const col = p.columnName;
    if (col.includes("/")) {
      out = coercePath(out, col.split("/"), p.config, at + col);
    } else if (col in out) {
      out[col] = coerceValue(p.config, out[col], at + col);
    }
  }
  for (const e of expand ?? []) {
    // A provider-routed target is a person column: its sub-records arrive in the
    // UIL's spelling and are renamed back before they are typed.
    const person = e.source?.kind === "provider";
    if (!person && !e.properties?.length) continue;
    const sub = out[e.navColumn];
    if (sub === null || sub === undefined || typeof sub !== "object") continue;
    const rows = expandedRows(sub);
    const below = `${at}${e.navColumn}/`;
    const one = (r: Record<string, unknown>): Record<string, unknown> =>
      typeRecord(
        person ? inboundPersonExpand(r, e.selectFields) : r,
        e.properties,
        undefined,
        below,
      );
    out[e.navColumn] = rows
      ? rows.map(one)
      : one(sub as Record<string, unknown>);
  }
  return out;
}

/**
 * A record with every described column typed. Absent columns stay absent,
 * undescribed ones pass through, and expanded sub-records are typed with their
 * clause's properties (the target entity's). With nothing to describe, the
 * record itself is returned — no copy, no work.
 */
export const coerceRecord = (
  record: Record<string, unknown>,
  properties?: readonly Property[],
  expand?: readonly IExpandClause[],
): Record<string, unknown> => typeRecord(record, properties, expand, "");

export const coerceRecords = (
  records: readonly Record<string, unknown>[],
  properties?: readonly Property[],
  expand?: readonly IExpandClause[],
): Record<string, unknown>[] =>
  records.map((r) => coerceRecord(r, properties, expand));
