import type { UserSettingsStore } from "@speel/identity";
import type { StoredView, TableViewStore } from "./viewStore.js";

const PREFIX = "table.view.";
const keyFor = (tableId: string, viewId: string): string =>
  `${PREFIX}${tableId}.${viewId}`;

let counter = 0;

/**
 * The existing view store, backed by user settings — so a saved view follows the user rather
 * than the browser.
 *
 * One settings key per view, not one key holding an array: renaming one view and deleting
 * another then never touch the same row, which is the whole point of one-row-per-key. `list`
 * is a prefix scan over a map the settings store has already loaded, so it costs nothing.
 */
export function createSettingsViewStore(
  settings: UserSettingsStore,
): TableViewStore {
  return {
    list: async (tableId) => {
      const all = await settings.getAll();
      const prefix = `${PREFIX}${tableId}.`;
      return Object.entries(all)
        .filter(([key]) => key.startsWith(prefix))
        .map(([, value]) => value as StoredView);
    },

    save: async (view) => {
      // Date.now() alone collides when two views are created in the same millisecond.
      const id =
        view.id === ""
          ? `v${Date.now().toString(36)}-${(counter += 1)}`
          : view.id;
      const saved: StoredView = { ...view, id };
      await settings.set(keyFor(saved.tableId, id), saved);
      return saved;
    },

    remove: async (viewId) => {
      const all = await settings.getAll();
      const key = Object.keys(all).find(
        (k) => k.startsWith(PREFIX) && k.endsWith(`.${viewId}`),
      );
      if (key !== undefined) await settings.remove(key);
    },
  };
}
