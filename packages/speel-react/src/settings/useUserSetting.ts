import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { UserSettingsStore } from "@speel/identity";

/** How long a value sits in memory before it is written. Long enough to collapse a drag. */
const FLUSH_DELAY_MS = 800;

interface SettingsContextValue {
  store: UserSettingsStore | undefined;
  values: Record<string, unknown>;
  ready: boolean;
  error: string | undefined;
  set: (key: string, value: unknown) => void;
}

const INERT: SettingsContextValue = {
  store: undefined,
  values: {},
  ready: false,
  error: undefined,
  set: () => undefined,
};

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined,
);

export interface UserSettingsProviderProps {
  store?: UserSettingsStore | undefined;
  children: ReactNode;
}

/**
 * Loads every setting once and holds them in context, so reads are synchronous and a
 * preference renders correctly on first paint rather than flashing its default.
 *
 * Writes are optimistic and flushed on a debounce: a settings write is never worth blocking
 * an interaction on, and a toggle clicked three times should cost one round trip. The
 * `pagehide` flush covers the case the debounce creates — a value changed immediately before
 * navigating away — which is the one path that only matters when the page is about to stop
 * existing, and so the one least likely to be noticed if it breaks.
 */
export function UserSettingsProvider({
  store,
  children,
}: UserSettingsProviderProps): JSX.Element {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const pending = useRef(new Map<string, unknown>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!store) return;
    let live = true;
    store.getAll().then(
      (all) => {
        if (live) {
          setValues(all);
          setReady(true);
        }
      },
      (e: unknown) => {
        if (live) {
          setError(e instanceof Error ? e.message : String(e));
          setReady(true);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [store]);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (!store) {
      pending.current.clear();
      return;
    }
    const entries = [...pending.current.entries()];
    pending.current.clear();
    for (const [key, value] of entries) {
      // A failed write keeps the in-memory value rather than reverting under the user; the
      // next change retries.
      void Promise.resolve(store.set(key, value)).catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
    }
  }, [store]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush(); // unmounting is the same problem as navigating away
    };
  }, [flush]);

  const set = useCallback(
    (key: string, value: unknown) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      // Replacing rather than queueing: three clicks of a toggle are one write of the last value.
      pending.current.set(key, value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, FLUSH_DELAY_MS);
    },
    [flush],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({ store, values, ready, error, set }),
    [store, values, ready, error, set],
  );

  return createElement(SettingsContext.Provider, { value }, children);
}

/**
 * One user preference, read synchronously and written debounced.
 *
 * Deliberately the shape of `useUrlState`: the query string carries what is shareable, the
 * settings store carries what is personal. Works with no store configured — the value lives
 * for the session and `ready` stays false — so a component need not know how the app is wired.
 */
export function useUserSetting<T>(
  key: string,
  defaultValue: T,
): [T, (next: T) => void, boolean] {
  const ctx = useContext(SettingsContext) ?? INERT;
  const [sessionOnly, setSessionOnly] = useState<T | undefined>(undefined);

  const stored = ctx.values[key];
  const value =
    stored !== undefined ? (stored as T) : (sessionOnly ?? defaultValue);

  const set = useCallback(
    (next: T) => {
      setSessionOnly(next);
      ctx.set(key, next);
    },
    [ctx, key],
  );

  return [value, set, ctx.ready];
}

/** The settings context, for surfaces that want to report a failed write. */
export function useUserSettingsStatus(): {
  ready: boolean;
  error: string | undefined;
} {
  const ctx = useContext(SettingsContext) ?? INERT;
  return { ready: ctx.ready, error: ctx.error };
}

/**
 * The store behind the settings context, for features that persist their own shapes rather
 * than reading a single key — the table's saved views, for one.
 */
export function useUserSettingsStore(): UserSettingsStore | undefined {
  return (useContext(SettingsContext) ?? INERT).store;
}
