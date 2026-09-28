import type { DbContext } from "@speel/core";
import { SharedTableView } from "@speel/core";
import type {
  StoredView,
  TableViewDescriptor,
  TableViewStore,
} from "./viewStore.js";

/**
 * Where published views live.
 *
 * A `TableViewStore` plus one question, because the picker has to decide whether to offer
 * Publish *before* any click — discovering the answer from a 403 puts a failure in front of
 * every user who will never have permission.
 */
export interface SharedTableViewStore extends TableViewStore {
  /** May the current user publish, rename, or delete shared views? */
  canPublish(): Promise<boolean>;
}

export interface EntitySharedViewStoreOptions {
  /**
   * Whether the current user may write to the shared list. speel has no effective-permissions
   * API, so the app answers — from pnp's `effectiveBasePermissions`, a group check, or
   * whatever it already knows. Omitted, nobody can publish: hiding the action is a better
   * failure than offering one that 403s.
   */
  canPublish?: () => Promise<boolean>;
}

const toStored = (row: SharedTableView): StoredView | undefined => {
  if (row.Id === undefined || row.TableId === null) return undefined;
  let descriptor: TableViewDescriptor;
  try {
    descriptor =
      row.Descriptor === null
        ? { columns: [] }
        : (JSON.parse(row.Descriptor) as TableViewDescriptor);
  } catch {
    // A hand-edited row should not take the whole picker down with it.
    return undefined;
  }
  return {
    id: String(row.Id),
    tableId: row.TableId,
    name: row.Title ?? "Untitled",
    descriptor,
  };
};

/** Backed by the `SharedTableView` list: readable by everyone, writable by whoever the tenant allows. */
export function createEntitySharedViewStore(
  db: DbContext,
  opts: EntitySharedViewStoreOptions = {},
): SharedTableViewStore {
  const rowFor = async (
    viewId: string,
  ): Promise<SharedTableView | undefined> => {
    const rows = await db
      .set(SharedTableView)
      .where((b) => b.Id.eq(Number(viewId)))
      .toArrayAsync();
    return rows[0];
  };

  return {
    list: async (tableId) => {
      const rows = await db
        .set(SharedTableView)
        .where((b) => b.TableId.eq(tableId))
        .toArrayAsync();
      return rows.map(toStored).filter((v): v is StoredView => v !== undefined);
    },

    save: async (view) => {
      const json = JSON.stringify(view.descriptor);
      const existing = view.id === "" ? undefined : await rowFor(view.id);
      if (existing) {
        existing.Title = view.name;
        existing.Descriptor = json;
        await db.saveChangesAsync();
        return { ...view, id: String(existing.Id) };
      }
      const row = new SharedTableView();
      row.Title = view.name;
      row.TableId = view.tableId;
      row.Descriptor = json;
      db.set(SharedTableView).add(row);
      await db.saveChangesAsync();
      return { ...view, id: String(row.Id) };
    },

    remove: async (viewId) => {
      const existing = await rowFor(viewId);
      if (!existing) return;
      db.set(SharedTableView).remove(existing);
      await db.saveChangesAsync();
    },

    canPublish: opts.canPublish ?? (() => Promise.resolve(false)),
  };
}
