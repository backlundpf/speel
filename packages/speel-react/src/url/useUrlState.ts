import * as React from "react";
// React 17 is this package's peer floor; useSyncExternalStore is React 18+, so it
// comes from the React team's backport rather than from react itself.
import { useSyncExternalStore } from "use-sync-external-store/shim";
import type { UrlCodec, UrlHistoryMode } from "./codecs.js";
import { getUrlSnapshot, subscribeToUrl, writeUrlParams } from "./urlStore.js";

/** The decoded value type for a codec spec. */
export type UrlValues<S> = {
  [K in keyof S]: S[K] extends UrlCodec<infer T> ? T : never;
};

/**
 * Bind a surface's shareable state to the page's query string.
 *
 * Values are decoded during render, so a deep-linked value is available on the
 * first paint. Derive from them rather than copying into `useState`: two sources
 * of truth is what makes reader/writer ordering a problem, and there is nothing
 * to reconcile with one.
 *
 * The spec object is read through a ref, so an inline literal is fine — but its
 * KEYS and codec behaviour are assumed stable across renders.
 */
export function useUrlState<V extends Record<string, unknown>>(
  // Inferring V from the codecs, rather than constraining the spec to some
  // UrlCodec<T>, is deliberate: T sits in both covariant (decode's return,
  // defaultValue) and contravariant (encode's parameter) positions, so UrlCodec
  // is invariant in T and no single constraint accepts a mixed spec.
  spec: { [K in keyof V]: UrlCodec<V[K]> },
): [V, (next: Partial<V>) => void] {
  const search = useSyncExternalStore(
    subscribeToUrl,
    getUrlSnapshot,
    getUrlSnapshot,
  );

  const specRef = React.useRef(spec);
  specRef.current = spec;

  const values = React.useMemo(() => {
    const params = new URLSearchParams(search);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(specRef.current)) {
      out[key] = (specRef.current[key] as unknown as UrlCodec<unknown>).decode(
        params.get(key),
      );
    }
    return out as V;
    // `search` is the only real input. specRef keeps the spec's identity churn —
    // it is usually an inline literal — from recomputing on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const setParams = React.useCallback((next: Partial<V>) => {
    const current = specRef.current;
    const entries: Array<[string, string | null]> = [];
    let mode: UrlHistoryMode = "replace";

    for (const key of Object.keys(next)) {
      const codec = current[key] as unknown as UrlCodec<unknown> | undefined;
      if (!codec) continue;
      const encoded = codec.encode((next as Record<string, unknown>)[key]);
      // A value encoding to the same text as the default is omitted, so "absent"
      // and "default" can never become two states that disagree.
      const isDefault = encoded === codec.encode(codec.defaultValue);
      entries.push([key, encoded === null || isDefault ? null : encoded]);
      // Mixed modes in one set push: pushing is the conservative choice when any
      // part of the change is navigational.
      if (codec.history === "push") mode = "push";
    }

    if (entries.length > 0) writeUrlParams(entries, mode);
  }, []);

  return [values, setParams];
}
