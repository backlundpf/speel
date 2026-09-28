import {
  InMemoryCacheProvider,
  IndexedDbCacheProvider,
} from "../../src/index.js";
import type {
  ICacheProvider,
  ICachedListState,
  ICacheEntry,
} from "../../src/index.js";

// Both providers satisfy the public ICacheProvider interface.
const a: ICacheProvider = new InMemoryCacheProvider();
const b: ICacheProvider = new IndexedDbCacheProvider({
  indexedDB: undefined as unknown as IDBFactory,
});
void a;
void b;

const state: ICachedListState = { token: "t", lastSyncedAt: 1, stale: false };
const entry: ICacheEntry = { state, records: [] };
void entry;
