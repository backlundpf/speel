import type { DatePreset } from "@speel/core";
import type { TableSort } from "../../adapter/SpeelUIAdapter.js";
import type { FilterCriteria } from "../filter/match.js";

function iso(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromIso(s: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Values ride inside comma-separated lists, so a comma in the data has to survive.
const esc = (s: string): string => s.replace(/~/g, "~t").replace(/,/g, "~c");
const unesc = (s: string): string => s.replace(/~c/g, ",").replace(/~t/g, "~");

/** Criteria → query-string text. `undefined` means "nothing to write". */
export function encodeCriteria(c: FilterCriteria): string | undefined {
  switch (c.kind) {
    case "text":
      return c.query.trim() === "" ? undefined : `t:${esc(c.query)}`;
    case "select":
      return c.selected.length === 0
        ? undefined
        : `s:${c.selected.map((v) => esc(String(v))).join(",")}`;
    case "boolean":
      return `b:${c.value ? "1" : "0"}`;
    case "numberRange":
      if (c.min === undefined && c.max === undefined) return undefined;
      return `n:${c.min ?? ""},${c.max ?? ""}`;
    case "dateRange":
      // A preset must persist AS the preset: a view saved as `thisFiscalQuarter` still
      // means this quarter next year, not the dates it resolved to on the day it was saved.
      if (c.preset) return `d:p:${c.preset}`;
      if (c.from === undefined && c.to === undefined) return undefined;
      return `d:${c.from ? iso(c.from) : ""},${c.to ? iso(c.to) : ""}`;
  }
}

/** Query-string text → criteria. Junk yields undefined. */
export function decodeCriteria(raw: string | null): FilterCriteria | undefined {
  if (raw === null || raw === "") return undefined;
  const body = raw.slice(2);
  switch (raw.slice(0, 2)) {
    case "t:":
      return { kind: "text", query: unesc(body) };
    case "s:":
      return { kind: "select", selected: body.split(",").map(unesc) };
    case "b:":
      return { kind: "boolean", value: body === "1" };
    case "n:": {
      const [min, max] = body.split(",");
      const hasMin = min !== undefined && min !== "";
      const hasMax = max !== undefined && max !== "";
      if (!hasMin && !hasMax) return undefined;
      return {
        kind: "numberRange",
        ...(hasMin ? { min: Number(min) } : {}),
        ...(hasMax ? { max: Number(max) } : {}),
      };
    }
    case "d:": {
      if (body.startsWith("p:"))
        return { kind: "dateRange", preset: body.slice(2) as DatePreset };
      const [from, to] = body.split(",");
      const parsedFrom = from ? fromIso(from) : undefined;
      const parsedTo = to ? fromIso(to) : undefined;
      if (parsedFrom === undefined && parsedTo === undefined) return undefined;
      return {
        kind: "dateRange",
        ...(parsedFrom !== undefined ? { from: parsedFrom } : {}),
        ...(parsedTo !== undefined ? { to: parsedTo } : {}),
      };
    }
    default:
      return undefined;
  }
}

export function encodeSort(sort: TableSort): string {
  return `${sort.key}:${sort.direction}`;
}

export function decodeSort(raw: string | null): TableSort | undefined {
  if (!raw) return undefined;
  const idx = raw.lastIndexOf(":");
  if (idx <= 0) return undefined;
  const direction = raw.slice(idx + 1);
  if (direction !== "asc" && direction !== "desc") return undefined;
  return { key: raw.slice(0, idx), direction };
}

/** The question one table is asking, as the URL carries it. */
export interface UrlQuestion {
  filters: Record<string, FilterCriteria>;
  sort?: TableSort;
  page?: number;
  /** Scope filters the user dismissed — distinct from "never applied". */
  clearedScope: string[];
  search?: string;
}

/**
 * The wire shape, short-keyed because it rides in a URL: `f` filters, `s` sort, `pg` page,
 * `cs` cleared scope, `q` search. Criteria are the per-criteria strings `encodeCriteria`
 * produces rather than nested objects, so dates and every future criteria kind keep ONE
 * tested serialization and `f` stays a flat map a human can read in a pasted link.
 */
interface QuestionBlob {
  f?: Record<string, string>;
  s?: string;
  pg?: number;
  cs?: string[];
  q?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The whole question as one JSON string.
 *
 * `f` is always written, empty map included: the blob's presence means the URL answers for
 * the question wholesale, so `f: {}` is how "the user cleared every filter" is said — the
 * ambiguity that a set of per-column keys could not express without a sentinel.
 */
export function encodeQuestion(q: {
  filters?: Record<string, FilterCriteria> | undefined;
  sort?: TableSort | undefined;
  page?: number | undefined;
  clearedScope?: readonly string[] | undefined;
  search?: string | undefined;
}): string {
  const f: Record<string, string> = {};
  for (const [column, criteria] of Object.entries(q.filters ?? {})) {
    const encoded = encodeCriteria(criteria);
    if (encoded !== undefined) f[column] = encoded;
  }
  const blob: QuestionBlob = { f };
  if (q.sort) blob.s = encodeSort(q.sort);
  // Page 0 is the resting state; spelling it out would put it in every link.
  if (q.page !== undefined && q.page > 0) blob.pg = q.page;
  if (q.clearedScope && q.clearedScope.length > 0)
    blob.cs = [...q.clearedScope];
  // Trimmed: the table matches on terms, so surrounding whitespace asks nothing.
  const search = q.search?.trim();
  if (search) blob.q = search;
  return JSON.stringify(blob);
}

/**
 * JSON string → question. `undefined` means the text is not a question at all — the caller
 * warns and falls back to the view, since a blob is user-carried state.
 *
 * A readable blob with unreadable PARTS keeps what it can: one dead filter key is the same
 * class of mistake a dead key in a saved view is, and the table already reports those.
 */
export function decodeQuestion(raw: string | null): UrlQuestion | undefined {
  if (raw === null || raw === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const { f, s, pg, cs, q } = parsed as QuestionBlob;
  if (f !== undefined && !isRecord(f)) return undefined;

  const filters: Record<string, FilterCriteria> = {};
  for (const [column, value] of Object.entries(f ?? {})) {
    const criteria =
      typeof value === "string" ? decodeCriteria(value) : undefined;
    if (criteria) filters[column] = criteria;
  }
  const sort = typeof s === "string" ? decodeSort(s) : undefined;
  const page = typeof pg === "number" && Number.isFinite(pg) ? pg : undefined;
  const clearedScope = Array.isArray(cs)
    ? cs.filter((c): c is string => typeof c === "string")
    : [];
  const search = typeof q === "string" && q.trim() !== "" ? q : undefined;
  return {
    filters,
    clearedScope,
    ...(sort !== undefined ? { sort } : {}),
    ...(page !== undefined ? { page } : {}),
    ...(search !== undefined ? { search } : {}),
  };
}

export interface TableUrlKeys {
  /** The whole question, one JSON blob — see `encodeQuestion`. */
  question: string;
  /** Which view the link means, by name. Not part of the question the blob asks. */
  view: string;
  all: () => string[];
}

/**
 * A table owns exactly two params: the bare prefix carrying its question, and `<prefix>.v`
 * naming its view. The prefix is lowercased per the convention `useUrlState` set. Short
 * prefixes matter: SPFx paths are long before we add anything, and links get pasted into
 * clients that truncate.
 */
export function tableUrlKeys(prefix: string): TableUrlKeys {
  const p = prefix.toLowerCase();
  return {
    question: p,
    view: `${p}.v`,
    all: () => [p, `${p}.v`],
  };
}
