// src/Cache/ICacheProvider.ts

/** Per-list sync metadata persisted alongside cached records. */
export interface ICachedListState {
  token?: string; // SharePoint change token from the last sync
  lastSyncedAt?: number; // client epoch ms; fallback for TTL when token-ticks parsing fails
  stale?: boolean; // forced-resync flag set by write-through invalidation
}

export interface ICacheEntry {
  state: ICachedListState;
  records: Record<string, unknown>[];
}

/**
 * Dumb storage seam for the list cache. Implementations know nothing about
 * SharePoint or merge policy — they store raw provider records keyed by Id and
 * per-list state. Keys are produced by listKey(IListHandle). The cache owns record
 * isolation: a row returned from `read` must not alias the store or another
 * `read`'s result, because Materialize copies nothing on the way to an entity.
 */
export interface ICacheProvider {
  read(listKey: string): Promise<ICacheEntry | null>;
  replaceAll(
    listKey: string,
    records: readonly Record<string, unknown>[],
    state: ICachedListState,
  ): Promise<void>;
  applyDelta(
    listKey: string,
    upserts: readonly Record<string, unknown>[],
    deletedIds: readonly number[],
    state: ICachedListState,
  ): Promise<void>;
  markStale(listKey: string): Promise<void>;
  clear(listKey?: string): Promise<void>;
}

/** Extract the numeric key from a raw provider record (SP returns `ID`). */
export function recordId(record: Record<string, unknown>): number {
  return (record["ID"] ?? record["Id"]) as number;
}
