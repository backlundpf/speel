import { InvalidOperationException, type DbContext } from "@speel/core";
import { UserSetting } from "./UserSetting.js";

/**
 * Where a user's own settings live.
 *
 * `getAll` rather than per-key reads: the backing list returns only the current user's rows —
 * a handful — so one query at startup beats N round trips and makes every later read
 * synchronous, which is what lets a theme render correctly on first paint instead of flashing
 * the default.
 */
export interface UserSettingsStore {
  getAll(): Promise<Record<string, unknown>>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

const KEY = "speel.userSettings";

function readLocal(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    // Unreadable storage is an empty store, never an exception mid-render.
    return {};
  }
}

function writeLocal(all: Record<string, unknown>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Quota, or a privacy mode that forbids writes: the value stays in memory.
  }
}

/** The default: per-browser, no provisioning required — and what tests use. */
export function createLocalUserSettingsStore(): UserSettingsStore {
  return {
    getAll: () => Promise.resolve(readLocal()),
    set: (key, value) => {
      const all = readLocal();
      all[key] = value;
      writeLocal(all);
      return Promise.resolve();
    },
    remove: (key) => {
      const all = readLocal();
      delete all[key];
      writeLocal(all);
      return Promise.resolve();
    },
  };
}

/**
 * Backed by the `UserSetting` list, so settings follow the user rather than the browser.
 *
 * No author filter appears here on purpose: the list's item-level security means the server
 * already returns only this user's rows, and a filter here would imply the scoping is this
 * code's job when it is not.
 */
export function createEntityUserSettingsStore(
  db: DbContext,
): UserSettingsStore {
  /**
   * The entity reaches the model by being declared on the context, so a context that did not
   * extend `IdentityDbContext` fails deep inside a query with a bare "not mapped". Checking
   * here costs nothing and names the fix.
   */
  const assertRegistered = (): void => {
    if (db.model.findEntityType(UserSetting) === undefined) {
      throw new InvalidOperationException(
        "UserSetting is not registered on this context. Extend IdentityDbContext (from " +
          "@speel/identity) instead of DbContext to use identity.settings.",
      );
    }
  };

  const rowFor = async (key: string): Promise<UserSetting | undefined> => {
    const rows = await db
      .set(UserSetting)
      .where((b) => b.Title.eq(key))
      .toArrayAsync();
    return rows[0];
  };

  return {
    getAll: async () => {
      assertRegistered();
      const rows = await db.set(UserSetting).toArrayAsync();
      const out: Record<string, unknown> = {};
      for (const row of rows) {
        if (row.Title === null) continue;
        try {
          out[row.Title] = row.Value === null ? null : JSON.parse(row.Value);
        } catch {
          // A hand-edited row should not take the whole store down with it.
        }
      }
      return out;
    },

    set: async (key, value) => {
      assertRegistered();
      const json = JSON.stringify(value);
      const existing = await rowFor(key);
      if (existing) {
        existing.Value = json;
      } else {
        const row = new UserSetting();
        row.Title = key;
        row.Value = json;
        db.set(UserSetting).add(row);
      }
      await db.saveChangesAsync();
    },

    remove: async (key) => {
      assertRegistered();
      const existing = await rowFor(key);
      if (!existing) return;
      db.set(UserSetting).remove(existing);
      await db.saveChangesAsync();
    },
  };
}
