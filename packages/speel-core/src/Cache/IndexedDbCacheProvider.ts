// src/Cache/IndexedDbCacheProvider.ts
import type {
  ICacheProvider,
  ICacheEntry,
  ICachedListState,
} from "./ICacheProvider.js";
import { recordId } from "./ICacheProvider.js";

export interface IIndexedDbCacheOptions {
  dbName?: string;
  indexedDB?: IDBFactory;
}

const RECORDS = "records";
const META = "meta";
// v2: the typed provider boundary. Records written by a v1 database hold
// wire-shaped values (ISO strings, 0/1 booleans) that Materialize no longer
// coerces, so the upgrade drops both stores; the next cacheAsync finds no token
// and re-syncs from scratch. Bump again whenever what a record holds changes shape.
const DB_VERSION = 2;

export class IndexedDbCacheProvider implements ICacheProvider {
  private readonly dbName: string;
  private readonly idb: IDBFactory;
  private dbPromise: Promise<IDBDatabase> | undefined;

  constructor(options: IIndexedDbCacheOptions = {}) {
    this.dbName = options.dbName ?? "speel-cache";
    const idb =
      options.indexedDB ??
      (typeof globalThis !== "undefined" ? globalThis.indexedDB : undefined);
    if (!idb) {
      throw new Error(
        "IndexedDbCacheProvider: no IndexedDB available. Pass options.indexedDB or run in a browser.",
      );
    }
    this.idb = idb;
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = this.idb.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = req.result;
        if (event.oldVersion < 2) {
          if (db.objectStoreNames.contains(RECORDS))
            db.deleteObjectStore(RECORDS);
          if (db.objectStoreNames.contains(META)) db.deleteObjectStore(META);
        }
        if (!db.objectStoreNames.contains(RECORDS))
          db.createObjectStore(RECORDS);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      req.onsuccess = () => {
        const db = req.result;
        // Another tab opening a NEWER version fires `versionchange` at every
        // connection still holding the old one; a connection that stays open
        // blocks that upgrade indefinitely. Close out: this tab is running the
        // code the upgrade replaces, and its next cache call fails rather than
        // writing the shape the new version just dropped.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private recKey(listKey: string, id: number): string {
    return `${listKey}|${id}`;
  }
  private range(listKey: string): IDBKeyRange {
    return IDBKeyRange.bound(`${listKey}|`, `${listKey}|￿`);
  }

  async read(listKey: string): Promise<ICacheEntry | null> {
    const db = await this.open();
    return new Promise<ICacheEntry | null>((resolve, reject) => {
      const tx = db.transaction([RECORDS, META], "readonly");
      const metaReq = tx.objectStore(META).get(listKey);
      // getAll over the key range: one request instead of one cursor round-trip
      // per record, same records in the same key order.
      const recordsReq = tx.objectStore(RECORDS).getAll(this.range(listKey));
      tx.oncomplete = () => {
        const records = recordsReq.result as Record<string, unknown>[];
        const state = metaReq.result as ICachedListState | undefined;
        if (state === undefined && records.length === 0) resolve(null);
        else resolve({ state: state ?? {}, records });
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async replaceAll(
    listKey: string,
    records: readonly Record<string, unknown>[],
    state: ICachedListState,
  ): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction([RECORDS, META], "readwrite");
      const store = tx.objectStore(RECORDS);
      // Range delete clears the list's records in one request; the puts queue
      // behind it in the same transaction, so the end state is delete-then-put.
      store.delete(this.range(listKey));
      for (const r of records) store.put(r, this.recKey(listKey, recordId(r)));
      tx.objectStore(META).put({ ...state }, listKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async applyDelta(
    listKey: string,
    upserts: readonly Record<string, unknown>[],
    deletedIds: readonly number[],
    state: ICachedListState,
  ): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction([RECORDS, META], "readwrite");
      const store = tx.objectStore(RECORDS);
      for (const r of upserts) store.put(r, this.recKey(listKey, recordId(r)));
      for (const id of deletedIds) store.delete(this.recKey(listKey, id));
      tx.objectStore(META).put({ ...state }, listKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async markStale(listKey: string): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META, "readwrite");
      const store = tx.objectStore(META);
      const getReq = store.get(listKey);
      getReq.onsuccess = () => {
        const state = (getReq.result as ICachedListState | undefined) ?? {};
        store.put({ ...state, stale: true }, listKey);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(listKey?: string): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction([RECORDS, META], "readwrite");
      if (listKey === undefined) {
        tx.objectStore(RECORDS).clear();
        tx.objectStore(META).clear();
      } else {
        tx.objectStore(RECORDS).delete(this.range(listKey));
        tx.objectStore(META).delete(listKey);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
