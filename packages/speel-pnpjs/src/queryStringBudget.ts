// src/queryStringBudget.ts
//
// How many values fit inside one `in` filter before SharePoint rejects the URL.
//
// SharePoint's list-item OData has no `in` operator, so `toODataString` expands an
// `in` node into one `Col eq <value>` clause per value. The id COUNT, not the
// operator, therefore sets the query-string length — and a wide inverse-FK include
// walks straight into the server's limit:
//
//   [400] Bad Request ::> The length of the query string for this request exceeds
//   the configured maxQueryStringLength value.
//
// This module owns that arithmetic. `SharePointProvider.maxInFilterValues` exposes
// it to @speel/core, which knows neither the OData syntax nor the URL shape.

/**
 * ASP.NET's `httpRuntime/maxQueryStringLength` default, which SharePoint Online does
 * not raise; IIS request filtering's `maxQueryString` defaults to the same number.
 * It bounds the query string alone — the path before `?` does not count.
 */
const MAX_QUERY_STRING = 2048;

/**
 * Headroom held back for query-string members that do not exist yet at sizing time.
 *
 * PnPjs v4 follows the server's `__next`/`odata.nextLink`, carrying `$top`, `$select`,
 * `$expand`, `$filter` and `$orderby` forward while ADDING
 * `$skiptoken=Paged=TRUE&p_ID=<id>` (~39 chars encoded). Page 2 of a chunk is
 * therefore strictly longer than page 1, so a chunk sized to fit page 1 exactly still
 * 400s on page 2 — and only on lists large enough to page, which is the worst way to
 * find out. The reserve also absorbs an `$orderby`/`$skip` the caller may add.
 */
const PAGING_RESERVE = 384;

/**
 * Ceiling regardless of what the arithmetic allows — the fixed chunk size this budget
 * replaced. Nothing reaches it at the current reserve (the cheapest imaginable shape
 * lands slightly under 90); it is here so that lowering PAGING_RESERVE cannot quietly
 * start emitting longer OR-chains than SharePoint was ever asked to parse.
 */
const MAX_VALUES = 100;

/**
 * `$top`'s width is not knowable here (the caller picks the page size), and SharePoint
 * caps a page at 5000 rows — so four digits is its widest legal form.
 */
const TOP_COST = "$top=".length + 4;

/** The `(…) and FSObjType eq 0` wrapper `buildItemsFilter` puts around every item read. */
const ITEMS_ONLY_WRAPPER = "(()) and FSObjType eq 0";

/**
 * Length once URL-encoded. Encoded is never shorter than raw, so budgeting against it
 * is safe whether the server measures the encoded or the decoded query string.
 */
function encodedLength(s: string): number {
  return encodeURIComponent(s).length;
}

/** The read an `in` filter will ride on, as far as query-string length is concerned. */
export interface IInFilterQueryShape {
  /** Column the `in` filters on. */
  column: string;
  /** Widest value in the set — every value is costed at this width. */
  maxValue: number;
  /** `$select` members, already path-expanded. */
  selects: readonly string[];
  /** `$expand` members; empty for a plain (non-document) list. */
  expands: readonly string[];
}

/**
 * The largest number of values that may go into one `in` filter on this read.
 *
 * Costing every value at the widest over-counts by a few characters per value, which
 * shortens the chunk — wrong in the safe direction. The result is floored at 1 (a
 * caller may not drop values) and clamped at {@link MAX_VALUES}.
 */
export function maxInFilterValues(shape: IInFilterQueryShape): number {
  // `?`, `&` and `=` are literal separators in the URL, one character each; only the
  // member VALUES are encoded.
  const members: number[] = [];
  if (shape.selects.length)
    members.push("$select=".length + encodedLength(shape.selects.join(",")));
  if (shape.expands.length)
    members.push("$expand=".length + encodedLength(shape.expands.join(",")));
  members.push(TOP_COST);
  members.push("$filter=".length + encodedLength(ITEMS_ONLY_WRAPPER));
  const fixed = members.reduce((a, b) => a + b, 0) + (members.length - 1);

  // What each additional value adds: ` or Col eq <value>`. (The first value is a few
  // characters cheaper — it carries no leading ` or ` — which we do not claim back.)
  const perValue = encodedLength(` or ${shape.column} eq ${shape.maxValue}`);

  const room = MAX_QUERY_STRING - PAGING_RESERVE - fixed;
  return Math.min(MAX_VALUES, Math.max(1, Math.floor(room / perValue)));
}
