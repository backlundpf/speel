import type { UrlHistoryMode } from "./codecs.js";

type Listener = () => void;

const listeners = new Set<Listener>();
let popstateBound = false;

function readSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

/**
 * The snapshot is the raw search STRING, deliberately. useSyncExternalStore
 * compares snapshots by identity, so returning a decoded object here would
 * allocate a new one per call and re-render forever. Decoding belongs in the
 * hook, memoised over this string.
 */
let snapshot = readSearch();

function refresh(): void {
  const next = readSearch();
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function getUrlSnapshot(): string {
  return snapshot;
}

export function subscribeToUrl(listener: Listener): () => void {
  // popstate fires only for user-driven navigation (back/forward), never for our
  // own pushState/replaceState — those notify explicitly in writeUrlParams.
  if (!popstateBound && typeof window !== "undefined") {
    window.addEventListener("popstate", refresh);
    popstateBound = true;
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Apply `entries` to the live URL. Composed from window.location.href as it is at
 * this instant rather than from `snapshot`, so a key written by SharePoint's own
 * shell or another web part between our render and this call survives.
 */
export function writeUrlParams(
  entries: ReadonlyArray<[string, string | null]>,
  mode: UrlHistoryMode,
): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  for (const [key, value] of entries) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }

  const next = `${url.pathname}${url.search}${url.hash}`;
  try {
    if (mode === "push") window.history.pushState(null, "", next);
    else window.history.replaceState(null, "", next);
  } catch {
    // A host that forbids history writes must not break the surface. Only the URL
    // fails to update, which is strictly better than throwing mid-interaction.
  }

  refresh();
}

/** Test seam: drop subscribers and re-read the URL. Not part of the public API. */
export function __resetUrlStoreForTests(): void {
  listeners.clear();
  snapshot = readSearch();
}
