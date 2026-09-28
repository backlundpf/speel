import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DbContext,
  DbSet,
  IEntity,
  EntityCtor,
  EntityType,
  IQuery,
} from "@speel/core";

export interface TableData<T> {
  rows: readonly T[];
  loading: boolean;
  error: string | undefined;
  reload: () => Promise<void>;
}

/**
 * Fetches db.set(of) (optionally via `query`) on mount; `reload()` re-fetches.
 * `query` is read from a ref so an inline arrow doesn't loop the effect.
 */
export function useTableData<T extends IEntity>(
  db: DbContext,
  of: EntityCtor<T>,
  query: ((set: DbSet<T>) => IQuery<T>) | undefined,
): TableData<T> {
  const [rows, setRows] = useState<readonly T[]>([]);
  // Start loading so the first paint shows the spinner, not the empty state.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const queryRef = useRef(query);
  queryRef.current = query;

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const base = db.set(of);
      let q = (queryRef.current ? queryRef.current(base) : base) as IQuery<T>;
      // Auto-expand the reference/user navigations so their columns render the related object's
      // display value (an FK id alone shows nothing). `expand` resolves them inline on the read
      // we are already making, so depth-1 navigations cost no extra round trip.
      //
      // Inverse collections stay out — but not because they would be an N+1. An `include` on one
      // is a single chunked read for the whole page of rows, and the executor batches a whole
      // include depth into one provider call. The reason is that a collection has no display
      // value to put in a cell, so loading every child of every row would fetch data the table
      // never shows. A caller who wants them says so through `query`.
      const et = db.model.findEntityType(of as never) as
        EntityType<T> | undefined;
      if (et) {
        for (const nav of et.navigations()) {
          if (nav.storage === "inverse-fk") continue;
          q = q.expand((e) => (e as Record<string, unknown>)[nav.name]);
        }
      }
      setRows([...(await q.toArrayAsync())]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [db, of]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, loading, error, reload };
}
