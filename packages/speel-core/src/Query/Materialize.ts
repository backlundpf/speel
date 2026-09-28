import type { IEntity } from "../types.js";
import type { EntityType } from "../Metadata/EntityType.js";
import type { IExpandSpec } from "./IncludeNode.js";
import { recordId } from "../Cache/ICacheProvider.js";

// A column mapped to an expanded OData path (SpeelDocument.FileSize → 'File/Length')
// arrives nested under the expanded object, not as a flat key. Missing links yield
// undefined rather than throwing: a folder row, or an item whose file is gone, simply
// has no File.
export function resolvePath(
  record: Record<string, unknown>,
  path: string,
): unknown {
  let cur: unknown = record;
  for (const part of path.split("/")) {
    if (cur === null || cur === undefined || typeof cur !== "object")
      return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export const Materialize = {
  /**
   * A provider record → an entity. The record already holds TYPED values — the
   * provider types every column a property describes (core passes the properties
   * on every read) — so there is no wire to absorb here: read the column, treat
   * null/undefined as absent, apply the user's `codec.fromProvider` where a
   * property declares one, assign. That is the user's layer (a model type ↔ the
   * field's typed value) and the only one core applies — never `fromWire`, which
   * belongs to a Json column's own contents; per element for arrays.
   * A `fromProvider` answering `undefined` means "no matching model value", so
   * the property stays absent rather than becoming an own `undefined`.
   *
   * Nothing is copied here. A record handed to core is core's — the
   * IStorageProvider contract says so — so a Date or array in it is already the
   * entity's to own: the fake clones what it hands out, pnpjs builds fresh JSON
   * per response, and the caches (InMemoryCacheProvider, IndexedDbCacheProvider)
   * clone on the way in and out. Isolation is the record's source's job, once,
   * rather than a second defensive copy at every materialisation. `fromProvider`
   * still runs per element for arrays, and `map` answers a fresh array.
   */
  item<T extends IEntity>(
    record: Record<string, unknown>,
    et: EntityType<T>,
  ): T {
    const instance = new et.ctor();
    const e = instance as unknown as Record<string, unknown>;
    for (const p of et.properties) {
      const raw = p.key
        ? recordId(record)
        : p.columnName.includes("/")
          ? resolvePath(record, p.columnName)
          : record[p.columnName];
      if (raw === null || raw === undefined) continue;
      let v: unknown = raw;
      const conv = p.codec?.fromProvider;
      if (conv) v = Array.isArray(v) ? v.map((x) => conv(x)) : conv(v);
      if (v !== undefined) e[p.propertyName] = v;
    }
    return instance;
  },

  /** Attach eager-loaded expand sub-records onto an already-materialized target. */
  attachExpands(
    target: Record<string, unknown>,
    record: Record<string, unknown>,
    et: EntityType,
    expands: readonly IExpandSpec[],
  ): void {
    for (const ex of expands) {
      if (ex.materialize) {
        // A special expand's spec carries its own materializer; the whole record goes in
        // so the handler can read its top-level selectPaths fields too.
        ex.materialize(target, record);
        continue;
      }
      const nav = et.findNavigation(ex.navName);
      if (!nav) continue;
      // SP returns the expanded sub-record under the lookup column's internal name,
      // which may differ from the in-memory nav property name (hasColumnName).
      const raw = record[nav.columnName];
      if (raw === undefined || raw === null || typeof raw !== "object")
        continue;
      const one = (r: Record<string, unknown>): unknown =>
        Materialize.item(r, nav.target);
      // A multi-value expand arrives as an array of sub-records (the provider
      // unwraps any envelope its wire uses), a single-valued one as the record.
      target[ex.navName] = Array.isArray(raw)
        ? raw.map((r) => one(r as Record<string, unknown>))
        : one(raw as Record<string, unknown>);
    }
  },

  /** Materialize a fresh entity and attach its expands in one step. */
  itemWithExpands<T extends IEntity>(
    record: Record<string, unknown>,
    et: EntityType<T>,
    expands: readonly IExpandSpec[],
  ): T {
    const instance = Materialize.item(record, et);
    Materialize.attachExpands(
      instance as unknown as Record<string, unknown>,
      record,
      et,
      expands,
    );
    return instance;
  },
};
