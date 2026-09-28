import type { INavigation } from "../Metadata/Navigation.js";
import type { IEntity } from "../types.js";
import type {
  IStorageProvider,
  IReadOperation,
} from "../providers/ISharePointProvider.js";
import type { ChangeTracker } from "../ChangeTracker/ChangeTracker.js";
import { Materialize } from "./Materialize.js";
import { runReadBatch } from "./ReadBatch.js";
import { recordId } from "../Cache/ICacheProvider.js";

export function collectForeignKeyIds(
  parents: readonly Record<string, unknown>[],
  nav: INavigation,
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const push = (id: unknown) => {
    if (id === undefined || id === null) return;
    const n = typeof id === "number" ? id : Number(id);
    if (!Number.isFinite(n)) return;
    if (seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };

  if (nav.storage === "self-fk-scalar") {
    const fk = nav.foreignKey.propertyName;
    for (const p of parents) push(p[fk]);
  } else if (nav.storage === "self-fk-array") {
    const fk = nav.foreignKey.propertyName;
    for (const p of parents) {
      const arr = p[fk];
      if (!Array.isArray(arr)) continue;
      for (const v of arr) push(v);
    }
  } else {
    // inverse-fk: collect parent Ids (children carry the FK back).
    for (const p of parents) push((p as { Id?: unknown }).Id);
  }
  return out;
}

// Backends need not have a compact `in` operator — SharePoint's OData has none, so
// @speel/pnpjs expands an `in` node into one `Col eq <value>` clause per value. That
// makes the id COUNT, not the operator, set the request length, and a wide parent set
// walks into the endpoint's limit: a live include over ~130 parents came back
// "[400] Bad Request ::> The length of the query string for this request exceeds the
// configured maxQueryStringLength value."
//
// Core cannot budget that honestly — it knows neither the query syntax nor the URL
// shape, and a guess that under-reserves fails at runtime — so the provider owns the
// arithmetic and we consult it. Providers without the capability get a chunk small
// enough to be safe under any plausible cost model.
const FALLBACK_IN_FILTER_CHUNK = 25;

function inFilterChunkSize(
  provider: IStorageProvider,
  nav: INavigation,
  fkColumn: string,
  parentIds: readonly number[],
): number {
  if (!provider.maxInFilterValues) return FALLBACK_IN_FILTER_CHUNK;
  // The widest id in the set; the provider costs every value at that width.
  let widest = 0;
  for (const id of parentIds) if (id > widest) widest = id;
  const budget = provider.maxInFilterValues(
    fkColumn,
    nav.target.columnNames,
    widest,
  );
  // Floor at 1 whatever the provider says: a zero or negative budget would silently
  // drop parents AND stall the loop. One id per request is slow, never wrong.
  return Math.max(1, Math.floor(budget));
}

/** Page size for the inverse-FK include read — the value the inverse include has always used. */
export const INCLUDE_PAGE_SIZE = 1000;

/**
 * Decide the reads one navigation needs for one level. Pure: no I/O. The provider is
 * consulted only for the synchronous maxInFilterValues budget.
 *
 * Returning zero operations does NOT mean there is no work — applyIncludeLevel still
 * owes every parent a navigation assignment and a snapshot baseline.
 */
export function planIncludeLevel(
  parents: readonly Record<string, unknown>[],
  nav: INavigation,
  provider: IStorageProvider,
  nextToken: () => string,
): readonly IReadOperation[] {
  const ids = collectForeignKeyIds(parents, nav);
  if (ids.length === 0) return [];
  const target = nav.target;

  if (nav.storage !== "inverse-fk") {
    // One descriptor whatever the target: a list, or a provider source (a person
    // column resolves through the provider's `principals` collection, which is
    // also what warms its login cache for a later claims write).
    return [
      {
        kind: "itemsByIds",
        source: target.sourceHandle,
        ids,
        fields: target.columnNames,
        // The provider types the target's columns before they come back.
        properties: target.properties,
        clientToken: nextToken(),
      },
    ];
  }

  const fkColumn = nav.foreignKey.columnName;
  const chunk = inFilterChunkSize(provider, nav, fkColumn, ids);
  const ops: IReadOperation[] = [];
  for (let i = 0; i < ids.length; i += chunk) {
    ops.push({
      kind: "items",
      source: target.sourceHandle,
      fields: target.columnNames,
      pageSize: INCLUDE_PAGE_SIZE,
      options: {
        filter: {
          kind: "in",
          column: fkColumn,
          values: ids.slice(i, i + chunk),
          negate: false,
        },
        properties: target.properties,
      },
      clientToken: nextToken(),
    });
  }
  return ops;
}

/**
 * Record a navigation this include just populated as the parent's ORIGINAL state — the
 * same reset explicit loading performs (EntityEntry.loadNavAsync). Without it the parent's
 * snapshot, taken when it was materialized (QueryExecutor tracks BEFORE includes resolve)
 * or refreshed when it was last flushed, still says the nav was empty. The save-time
 * membership diff then reads every loaded child as newly added — normally invisible,
 * because re-writing a child's FK to the value it already holds produces no dirty column,
 * but fatal once a child is deleted: the phantom "add" fetches a row that is gone. It also
 * means a real removal can never be seen, since nothing is outside an empty original set.
 *
 * Untracked (asNoTracking) parents have no entry, and Added ones have no snapshot to
 * correct — markNavLoaded is a no-op for those.
 */
function markNavBaseline(
  parent: Record<string, unknown>,
  nav: INavigation,
  tracker: ChangeTracker,
  noTracking: boolean,
): void {
  if (noTracking) return;
  tracker.entryFor(parent as IEntity)?.markNavLoaded(nav.name);
}

function materializeOrTracked(
  rec: Record<string, unknown>,
  nav: INavigation,
  tracker: ChangeTracker,
  noTracking: boolean,
): unknown {
  if (noTracking) return Materialize.item(rec, nav.target);
  return tracker.materializeTracked(rec, nav.target);
}

/**
 * Attach one level's fetched records to their parents. Pure: no I/O.
 *
 * MUST be called for every planned navigation even when `fetched` is empty — a parent
 * whose FK array is absent still gets `[]`, a parent with no Id still gets `[]`, and
 * both still need markNavBaseline. Skipping that would leave navigations undefined and
 * reintroduce the phantom-add bug markNavBaseline documents above.
 */
export function applyIncludeLevel(
  parents: readonly Record<string, unknown>[],
  nav: INavigation,
  fetched: readonly Record<string, unknown>[],
  tracker: ChangeTracker,
  noTracking: boolean,
): readonly Record<string, unknown>[] {
  const records = fetched;

  const out: Record<string, unknown>[] = [];

  if (nav.storage === "self-fk-scalar" || nav.storage === "self-fk-array") {
    // Key off each record's OWN id: results arrive as a flat set, not aligned to the
    // ids we asked for, and missing ones are simply absent.
    const byId = new Map<number, Record<string, unknown>>();
    for (const rec of records) byId.set(recordId(rec), rec);

    // One fetched record → one entity, however many parents point at it. A record
    // handed to core is consumed once: Materialize copies nothing, so materializing
    // the same record per parent would hand N entities the record's one Date and
    // array instances, and the next level would see the same entity N times in
    // `out`. The tracked path already answers one instance through the identity
    // map; this makes the untracked path agree, and `out` unique on both.
    const materialized = new Map<Record<string, unknown>, unknown>();
    const entityFor = (rec: Record<string, unknown>): unknown => {
      if (materialized.has(rec)) return materialized.get(rec);
      const entity = materializeOrTracked(rec, nav, tracker, noTracking);
      materialized.set(rec, entity);
      out.push(entity as Record<string, unknown>);
      return entity;
    };

    if (nav.storage === "self-fk-scalar") {
      for (const parent of parents) {
        const fk = parent[nav.foreignKey.propertyName] as number | undefined;
        if (fk === undefined || fk === null) continue;
        const rec = byId.get(fk);
        if (!rec) continue;
        (parent as Record<string, unknown>)[nav.name] = entityFor(rec);
        markNavBaseline(parent, nav, tracker, noTracking);
      }
      return out;
    }

    for (const parent of parents) {
      const arr = parent[nav.foreignKey.propertyName];
      if (!Array.isArray(arr)) {
        (parent as Record<string, unknown>)[nav.name] = [];
        markNavBaseline(parent, nav, tracker, noTracking);
        continue;
      }
      const targets: unknown[] = [];
      for (const v of arr) {
        const rec = byId.get(v as number);
        if (rec) targets.push(entityFor(rec));
      }
      (parent as Record<string, unknown>)[nav.name] = targets;
      markNavBaseline(parent, nav, tracker, noTracking);
    }
    return out;
  }

  // inverse-fk — children carry the FK back, so group on it.
  const fkColumn = nav.foreignKey.columnName;
  const groups = new Map<number, Record<string, unknown>[]>();
  for (const rec of records) {
    const parentId = rec[fkColumn] as number | undefined;
    if (parentId === undefined) continue;
    let arr = groups.get(parentId);
    if (!arr) {
      arr = [];
      groups.set(parentId, arr);
    }
    arr.push(rec);
  }

  for (const parent of parents) {
    const pid = (parent as { Id?: unknown }).Id as number | undefined;
    if (pid === undefined) {
      (parent as Record<string, unknown>)[nav.name] = [];
      markNavBaseline(parent, nav, tracker, noTracking);
      continue;
    }
    const children: unknown[] = [];
    for (const rec of groups.get(pid) ?? []) {
      const entity = materializeOrTracked(rec, nav, tracker, noTracking);
      children.push(entity);
      out.push(entity as Record<string, unknown>);
    }
    (parent as Record<string, unknown>)[nav.name] = children;
    markNavBaseline(parent, nav, tracker, noTracking);
  }
  return out;
}
