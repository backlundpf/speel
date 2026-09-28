// src/Cache/InMemoryCacheProvider.ts
import type {
  ICacheProvider,
  ICacheEntry,
  ICachedListState,
} from "./ICacheProvider.js";
import { recordId } from "./ICacheProvider.js";

interface IStored {
  state: ICachedListState;
  records: Map<number, Record<string, unknown>>;
}

export class InMemoryCacheProvider implements ICacheProvider {
  private readonly entries = new Map<string, IStored>();

  async read(listKey: string): Promise<ICacheEntry | null> {
    const e = this.entries.get(listKey);
    if (!e) return null;
    return {
      state: { ...e.state },
      records: structuredClone([...e.records.values()]),
    };
  }

  async replaceAll(
    listKey: string,
    records: readonly Record<string, unknown>[],
    state: ICachedListState,
  ): Promise<void> {
    const map = new Map<number, Record<string, unknown>>();
    for (const r of records) map.set(recordId(r), structuredClone(r));
    this.entries.set(listKey, { state: { ...state }, records: map });
  }

  async applyDelta(
    listKey: string,
    upserts: readonly Record<string, unknown>[],
    deletedIds: readonly number[],
    state: ICachedListState,
  ): Promise<void> {
    const e = this.entries.get(listKey) ?? {
      state: {},
      records: new Map<number, Record<string, unknown>>(),
    };
    for (const r of upserts) e.records.set(recordId(r), structuredClone(r));
    for (const id of deletedIds) e.records.delete(id);
    e.state = { ...state };
    this.entries.set(listKey, e);
  }

  async markStale(listKey: string): Promise<void> {
    const e = this.entries.get(listKey);
    if (e) e.state = { ...e.state, stale: true };
  }

  async clear(listKey?: string): Promise<void> {
    if (listKey === undefined) this.entries.clear();
    else this.entries.delete(listKey);
  }
}
