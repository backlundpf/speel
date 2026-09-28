import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldConfig } from "@speel/core";
import { useSpeelUI } from "../context.js";
import type { FieldHandle } from "../form/FieldHandle.js";
import type {
  ComboboxCreate,
  FieldChrome,
  OptionItem,
} from "../adapter/SpeelUIAdapter.js";
import { useSelectionOptions } from "./useSelectionOptions.js";
import { SEARCH_DEBOUNCE_MS } from "./useDebouncedResolver.js";

type SelectionConfig = Extract<FieldConfig, { kind: "Choice" | "Lookup" }>;

const NO_MATCHES = "No matches.";
/** Deliberately not "no matches" — a read that never happened is a different story. */
const LOAD_FAILED =
  "Matches could not be loaded. Check the connection and retry.";

/** A caller of `onResolveSuggestions` still owed an answer, and the text it asked about. */
type Waiter = { q: string; resolve: (o: OptionItem[]) => void };

/**
 * The one selection control: a Choice, a lookup and an inverse collection all render as
 * the combobox. Options come from {@link useSelectionOptions}; this body is the bridge
 * between the skin's `onResolveSuggestions` and that hook, and the two modes bridge
 * differently.
 *
 * - **List mode** — the options are loaded once and searched in memory, so there is no
 *   debounce and no query state: a keystroke is answered from `optionsFor(q)` on the
 *   spot. Only an ask that arrives before the load lands waits, and it is answered for
 *   its own text when the load settles. A four-option Status field never waits at all.
 * - **Query mode** — each term is a read at the source. The typed text is debounced into
 *   the hook's query, and the resolver settles once the hook has the answer for it.
 *
 * Failure is reported, not swallowed. A rejected load resolves the suggestions as empty
 * with {@link LOAD_FAILED} under them; without that the skins render a broken read
 * exactly like a search that matched nothing.
 */
export function SelectionFieldBody({
  field,
  chrome,
  multi,
}: {
  field: FieldHandle;
  chrome: FieldChrome;
  /** Forces multi-select (an inverse collection); defaults to the config's `multi`. */
  multi?: boolean;
}): JSX.Element {
  const ui = useSpeelUI();
  const config = field.config as SelectionConfig;
  const isMulti = multi ?? config.multi;
  const [query, setQuery] = useState("");
  // Off until the picker first asks: opening a form reads nothing on this field's
  // behalf. The ref flips synchronously so a second ask in the same tick does not
  // schedule a second activation.
  const [active, setActive] = useState(false);
  const activated = useRef(false);
  const {
    mode,
    options,
    optionsFor,
    selectedItems,
    loading,
    failed,
    adopt,
    identityOf,
  } = useSelectionOptions(field, query, active);
  const create = useCreateState(field, isMulti, adopt, identityOf);

  // Everything the resolver has to read from a callback or a timer, kept current by
  // render so no closure can capture a stale copy of it.
  const latest = useRef({ mode, query, options, optionsFor, loading, failed });
  latest.current = { mode, query, options, optionsFor, loading, failed };

  const waiting = useRef<Waiter[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wasLoading = useRef(false);
  /** The text last asked about — set on the call, not on the debounced load. */
  const requested = useRef("");

  /** Hand every caller still waiting the answer the hook has now settled on. */
  const settle = useCallback(() => {
    const pending = waiting.current;
    if (pending.length === 0) return;
    waiting.current = [];
    const l = latest.current;
    for (const w of pending) {
      // A failed load has no answer. Resolving with the merged options would offer
      // the current selection back as if it were a search hit.
      if (l.failed) w.resolve([]);
      // List mode answers each caller for its own text; query mode's options ARE
      // the answer for the text last asked about.
      else w.resolve(l.mode === "list" ? l.optionsFor(w.q) : l.options);
    }
  }, []);

  // A load finishing is the only moment the options are known to be the ones asked for:
  // the render that moves the query still carries the previous load's rows. No dependency
  // array, because the transition — not any one value — is the signal.
  //
  // In query mode it must also be the load for the text last typed. A slower load for an
  // earlier prefix can land while the newest keystroke is still inside its debounce
  // window; settling on it would paint the wrong answer AND leave the right one with
  // nobody waiting for it, so the picker would sit on the older result. Skipping is safe:
  // query !== requested only while a debounce is pending, and that timer will move the
  // query and produce a load of its own. List mode has one load, so any settle is it.
  useEffect(() => {
    const was = wasLoading.current;
    wasLoading.current = loading;
    if (!was || loading) return;
    if (
      latest.current.mode === "list" ||
      latest.current.query === requested.current
    )
      settle();
  });

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  const onResolveSuggestions = useCallback(
    (q: string) =>
      new Promise<OptionItem[]>((resolve) => {
        waiting.current.push({ q, resolve });
        requested.current = q;

        // The first ask is what starts the first load. Until it lands the hook
        // reports `loading`, so the paths below queue this ask rather than answer it
        // from an empty list, and the load's completion settles it.
        if (!activated.current) {
          activated.current = true;
          setActive(true);
        }

        // List mode: the answer is in memory once the load lands, so there is nothing
        // to debounce. Before it lands, the waiter is settled by the load's transition.
        if (latest.current.mode === "list") {
          if (!latest.current.loading) settle();
          return;
        }

        if (timer.current !== undefined) clearTimeout(timer.current);
        timer.current = undefined;

        // The case below cannot produce a read however long we wait, so it is settled
        // here rather than behind the timer. Debouncing it would buy nothing and cost
        // the full window: the skins ask on every menu open, so a list that is already
        // loaded would blink empty for SEARCH_DEBOUNCE_MS each time it is opened.
        // (Query mode always has a source, so there is no "nothing wired" case here.)
        //
        // The text has not moved — a skin re-asking on open, or a keystroke undone before
        // the window closed. No load will start, so nothing would settle us later; answer
        // from what is in hand, unless a load for this same text is already in flight,
        // whose completion will answer instead.
        //
        // This short-circuit is load-bearing, not an optimization. The shadcn combobox
        // asks on focus AND on click, so without it every tab-through of a form would
        // fire a fresh cold read (and the debounce would only delay it, never cancel it).
        // Here the repeated "" is answered from the rows already in hand.
        if (q === latest.current.query) {
          if (!latest.current.loading) settle();
          return;
        }

        // Every keystroke is a read otherwise: the skins call `onResolveSuggestions` per
        // key and dedupe only consecutive identical queries, so "London" would be six
        // round trips. The wait is short enough that a pause mid-word still feels
        // like it answered immediately.
        timer.current = setTimeout(() => {
          timer.current = undefined;
          setQuery(q);
        }, SEARCH_DEBOUNCE_MS);
      }),
    [settle],
  );

  return (
    <ui.Combobox
      {...chrome}
      value={selectedItems}
      onChange={(v) => {
        if (isMulti) field.setValue(v.map((o) => o.data));
        else field.setValue(v[0]?.data ?? null);
      }}
      onResolveSuggestions={onResolveSuggestions}
      multi={isMulti}
      noResultsText={failed ? LOAD_FAILED : NO_MATCHES}
      {...(create !== undefined ? { create } : {})}
    />
  );
}

type CreateState = ComboboxCreate["state"];
const IDLE: CreateState = { kind: "idle" };

/**
 * The create lifecycle behind the skin's Add row, or `undefined` when the field cannot
 * create (no `field.create`).
 *
 * A lookup goes `idle → adding → idle | failed`: `undefined` from the creator is a
 * decline and changes nothing; a row replaces a single value or is appended to a multi,
 * and is adopted into the loaded rows so the list offers it next time; a rejection is
 * `failed` with its message, and picking again retries. Picks while `adding` are ignored
 * — the ref, not the state, is the guard, so two picks in one tick still create once.
 *
 * A fill-in Choice has nothing to persist: its text is the value, so it never shows
 * `adding` and cannot fail.
 *
 * The result lands on the value as it stands when the create settles, not when it
 * started. A multi appends to what is held then, unless that already holds the created
 * identity (an exact match the search did not offer, a fill-in already chosen). A single
 * value is replaced only if it is still the one held at the pick: a value the user
 * picked, or a reset applied, while adding wins. The row is adopted either way.
 */
function useCreateState(
  field: FieldHandle,
  isMulti: boolean,
  adopt: (row: unknown) => void,
  identityOf: (o: unknown) => string,
): ComboboxCreate | undefined {
  const [state, setState] = useState<CreateState>(IDLE);
  const busy = useRef(false);
  const latest = useRef(field);
  latest.current = field;
  // Set in the effect body as well as cleared in its cleanup, so a StrictMode
  // unmount/remount cycle leaves it true.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!field.create) return undefined;
  const isLookup = field.config?.kind === "Lookup";

  const apply = (created: unknown, heldAtPick: unknown): void => {
    const f = latest.current;
    if (isLookup) adopt(created);
    if (isMulti) {
      const held = Array.isArray(f.value) ? (f.value as unknown[]) : [];
      const id = identityOf(created);
      if (held.some((h) => identityOf(h) === id)) return;
      f.setValue([...held, created]);
    } else if (f.value === heldAtPick) f.setValue(created);
  };

  const onCreate = (text: string): void => {
    const run = latest.current.create;
    if (!run || busy.current) return;
    const heldAtPick = latest.current.value;
    if (!isLookup) {
      void run(text).then((v) => {
        if (mounted.current && v !== undefined) apply(v, heldAtPick);
      });
      return;
    }
    busy.current = true;
    setState({ kind: "adding", text });
    run(text).then(
      (created) => {
        busy.current = false;
        if (!mounted.current) return;
        if (created !== undefined) apply(created, heldAtPick);
        setState(IDLE);
      },
      (e: unknown) => {
        busy.current = false;
        if (!mounted.current) return;
        setState({
          kind: "failed",
          text,
          message: e instanceof Error ? e.message : String(e),
        });
      },
    );
  };

  return { onCreate, state };
}
