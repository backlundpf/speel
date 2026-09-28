// src/Cache/CacheCoordinator.ts
import type { IEntity } from "../types.js";
import type { EntityType } from "../Metadata/EntityType.js";
import type {
  IStorageProvider,
  IExpandClause,
} from "../providers/ISharePointProvider.js";
import type { IExpandSpec } from "../Query/IncludeNode.js";
import type {
  ICacheProvider,
  ICacheEntry,
  ICachedListState,
} from "./ICacheProvider.js";
import {
  resolveExpandFields,
  resolveExpandColumn,
} from "../Query/expandResolution.js";
import { Materialize } from "../Query/Materialize.js";
import { listKey } from "./listKey.js";
import { InvalidOperationException } from "../errors.js";
import { requireChangeFeed } from "../providers/capabilities.js";

export class CacheCoordinator {
  constructor(
    private readonly cache: ICacheProvider,
    private readonly sp: IStorageProvider,
  ) {}

  /** Return every cached item for `et` as untracked entities, syncing first when due. */
  async loadAllAsync(et: EntityType): Promise<IEntity[]> {
    const cfg = et.cache;
    if (!cfg) {
      throw new InvalidOperationException(
        `cacheAsync() requires ${et.ctor.name} to opt into caching. Call useCaching() in onModelCreating.`,
      );
    }
    if (et.source.kind !== "list") {
      throw new InvalidOperationException(
        `cacheAsync(): ${et.ctor.name} is not a cacheable list.`,
      );
    }
    const key = listKey(et.list);
    const fields = et.columnNames;
    const expandSpecs: IExpandSpec[] = cfg.expands.map((e) => ({
      navName: e.navName,
      fields: resolveExpandFields(et, e.navName, e.fields),
    }));
    // The target's properties ride each clause so the provider types the expanded
    // sub-records too. A name that is no navigation (the model already refuses a
    // special expand here) yields no navigation and so no properties.
    const expandClauses: IExpandClause[] = expandSpecs.map((e) => {
      const properties = et.findNavigation(e.navName)?.target.properties;
      return {
        navColumn: resolveExpandColumn(et, e.navName),
        selectFields: [...e.fields],
        ...(properties ? { properties } : {}),
      };
    });

    const entry = await this.cache.read(key);
    const priorToken = entry?.state.token;
    const now = Date.now();

    let records: readonly Record<string, unknown>[];
    if (this.mustSync(entry, cfg.timeout, now)) {
      const { changed, deletedIds, newToken } = await requireChangeFeed(
        this.sp,
        "cacheAsync()",
      ).getListItemChangesSinceToken(
        et.list,
        priorToken ?? "",
        fields,
        expandClauses,
        // Typed on the way in, so what the cache holds is what Materialize reads.
        et.properties,
      );
      const nextState: ICachedListState = {
        token: newToken,
        // Stamped AFTER the awaited sync: measuring the TTL from the pre-sync
        // clock would shorten every window by the sync's own duration.
        lastSyncedAt: Date.now(),
        stale: false,
      };
      if (priorToken === undefined) {
        await this.cache.replaceAll(key, changed, nextState);
      } else {
        await this.cache.applyDelta(key, changed, deletedIds, nextState);
      }
      const fresh = await this.cache.read(key);
      records = fresh?.records ?? [];
    } else {
      // TTL-fresh path: nothing was written since the read above, so a re-read
      // would return exactly `entry` — skip the second full cache scan.
      records = entry!.records;
    }
    return records.map((r) => Materialize.itemWithExpands(r, et, expandSpecs));
  }

  /** Force the next loadAllAsync for `et` to sync, regardless of TTL. */
  async markStaleAsync(et: EntityType): Promise<void> {
    await this.cache.markStale(listKey(et.list));
  }

  private mustSync(
    entry: ICacheEntry | null,
    timeout: number | undefined,
    now: number,
  ): boolean {
    if (!entry) return true;
    if (entry.state.stale === true) return true;
    if (timeout === undefined) return true; // always-sync
    // TTL is measured from when we last synced (client clock). The change
    // token's timestamp tracks the last *list modification*, not the last
    // check, so it can't drive the TTL.
    const last = entry.state.lastSyncedAt;
    if (last === undefined) return true;
    return now - last > timeout;
  }
}
