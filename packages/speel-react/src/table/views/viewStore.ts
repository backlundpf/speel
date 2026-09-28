import type { TableState } from "../useTableState.js";

/**
 * The arrangement a view names: everything in `TableState` except `page` and `clearedScope`,
 * which belong to the current visit rather than to the saved arrangement and must never be
 * folded into a view by Save.
 */
export type TableViewDescriptor = Omit<TableState, "page" | "clearedScope">;

export interface StoredView {
  id: string;
  tableId: string;
  name: string;
  descriptor: TableViewDescriptor;
}

/**
 * The app-authored baseline: present for every user, owned by nobody, never written to.
 * Deliberately NOT a `StoredView` — it has no id and never reaches the store, so a user who
 * never engages with views costs the store nothing and improving the baseline later reaches
 * everyone rather than only new users.
 */
export interface AppDefaultView {
  name: string;
  descriptor: TableViewDescriptor;
}

/**
 * Where views live. Per-user scoping is the store's business, not the component's — a
 * SharePoint list filtered to the current author, a personal-site list, or the localStorage
 * default below. `@speel/react` never learns which.
 */
export interface TableViewStore {
  list(tableId: string): Promise<StoredView[]>;
  /** Returns the saved record; an id is assigned when creating. */
  save(view: StoredView): Promise<StoredView>;
  remove(viewId: string): Promise<void>;
}

const KEY = "speel.tableViews";

function readAll(): StoredView[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StoredView[]) : [];
  } catch {
    // Unreadable storage is an empty store, never an exception mid-render.
    return [];
  }
}

function writeAll(views: readonly StoredView[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(views));
  } catch {
    // Quota, or a privacy mode that forbids writes: the arrangement stays in memory.
  }
}

let counter = 0;

/** The one-line default. An app that wants views to roam supplies its own store. */
export function createLocalViewStore(): TableViewStore {
  return {
    list: (tableId) =>
      Promise.resolve(readAll().filter((v) => v.tableId === tableId)),
    save: (view) => {
      const all = readAll();
      // Date.now() alone collides when two views are created in the same millisecond.
      const id =
        view.id === ""
          ? `v${Date.now().toString(36)}-${(counter += 1)}`
          : view.id;
      const saved: StoredView = { ...view, id };
      const idx = all.findIndex((v) => v.id === id);
      if (idx === -1) all.push(saved);
      else all[idx] = saved;
      writeAll(all);
      return Promise.resolve(saved);
    },
    remove: (viewId) => {
      writeAll(readAll().filter((v) => v.id !== viewId));
      return Promise.resolve();
    },
  };
}
