import { useCallback, useEffect, useRef } from "react";

/** Pixels of patience, in milliseconds. One knob for every picker that searches. */
export const SEARCH_DEBOUNCE_MS = 200;

/**
 * Debounce a picker's `onResolveSuggestions`.
 *
 * A picker asks on every keystroke, so typing "London" is six reads without
 * this — six Graph calls, or six SharePoint queries. Only the last one's answer
 * was ever going to be shown.
 *
 * The contract a picker needs is not quite a plain debounce: it hands back a
 * promise per call and expects every one of them to settle, so a superseded call
 * cannot simply be dropped or its picker waits forever. Every waiter is settled
 * with the answer to the LAST query asked — which is the answer they would all
 * have wanted anyway.
 *
 * A rejected search settles as no suggestions rather than rethrowing: a picker
 * has nowhere to put an exception, and an unhandled rejection in a keystroke
 * handler is worse than an empty list.
 */
export function useDebouncedResolver<T>(
  resolve: (query: string) => Promise<T[]>,
  ms: number = SEARCH_DEBOUNCE_MS,
): (query: string) => Promise<T[]> {
  const latest = useRef(resolve);
  latest.current = resolve;

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waiting = useRef<((items: T[]) => void)[]>([]);

  const settle = useCallback((items: T[]) => {
    const pending = waiting.current;
    waiting.current = [];
    for (const r of pending) r(items);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = undefined;
      // Unmounting with promises outstanding would leave the caller's awaits
      // dangling; settle them empty rather than never.
      settle([]);
    },
    [settle],
  );

  return useCallback(
    (query: string) =>
      new Promise<T[]>((resolvePromise) => {
        waiting.current.push(resolvePromise);
        if (timer.current !== undefined) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = undefined;
          void latest.current(query).then(
            (items) => settle(items),
            () => settle([]),
          );
        }, ms);
      }),
    [ms, settle],
  );
}
