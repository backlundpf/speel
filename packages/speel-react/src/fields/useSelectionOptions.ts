import { useEffect, useState } from "react";
import type { FieldConfig, OptionContext } from "@speel/core";
import type { FieldHandle } from "../form/FieldHandle.js";
import type { OptionItem } from "../adapter/SpeelUIAdapter.js";

type SelectionConfig = Extract<FieldConfig, { kind: "Choice" | "Lookup" }>;

const idOf = (o: unknown): string =>
  String((o as { Id?: number; ID?: number }).Id ?? (o as { ID?: number }).ID);

/**
 * A string for a Choice option's key, which is the option itself unless the model
 * declared `optionsValue`. A primitive is its own string. An object is keyed by
 * REFERENCE: `String(o)` is "[object Object]" for every object, which would key all
 * options alike and let the merge substitute the held value for each of them. The
 * WeakMap gives each instance one key for its lifetime, so it is stable across
 * renders and loads that return the same instances.
 */
const refKeys = new WeakMap<object, string>();
let nextRefKey = 0;
const keyString = (k: unknown): string => {
  if (k === null || (typeof k !== "object" && typeof k !== "function"))
    return String(k);
  let key = refKeys.get(k);
  if (key === undefined) {
    key = `ref:${++nextRefKey}`;
    refKeys.set(k, key);
  }
  return key;
};

/**
 * The stock client-side search: options whose rendered text contains the query,
 * case-insensitively. `""` keeps everything — the list as it opens.
 */
export function defaultOptionsQuery(
  query: string,
  options: readonly unknown[],
  textOf: (o: unknown) => string,
): unknown[] {
  const q = query.toLowerCase();
  if (q === "") return [...options];
  return options.filter((o) => textOf(o).toLowerCase().includes(q));
}

/**
 * The options machinery every selection field shares — a Choice, a lookup, an inverse
 * collection. The order is **load → availability → search → merge → build**, and the
 * merge stays last:
 *
 * 1. **Load.** `field.options` says which of two modes the field is in. `"list"` loads
 *    once per field instance — a declared list, a thunk, or a lookup's target rows —
 *    and the effect is keyed on the field alone, never on `query`: typing must not
 *    re-read. `"query"` asks the source per term, so there `query` IS a dependency of
 *    the load. Either way nothing loads until `active` — the first ask, not the mount.
 * 2. **Availability.** `optionsFilter` sieves what the load returned: may this be chosen
 *    at all. It runs before the search so a search that ranks or truncates only ever
 *    sees selectable options.
 * 3. **Search** (list mode only). `optionsQuery`, or {@link defaultOptionsQuery} over
 *    the rendered text. Query mode skips it: the source already searched.
 * 4. **Merge.** The options carry the **current selection's own instance** for any
 *    matching identity — so a skin that matches by identity renders the selection even
 *    when the load returned a distinct instance with the same id. That substitution
 *    always runs. Selections the load omitted are prepended ONLY when the query is
 *    `""` — the list as it opens. Because this runs after availability, a value already
 *    saved stays offered there even when the predicate would now reject it; otherwise
 *    opening an older record would silently blank the field on the next save. On a
 *    typed search it is not prepended: the skin already shows the held value through
 *    `value={selectedItems}`, so adding it to a search it does not match only pollutes
 *    the results and lets a skin re-add an item it already holds.
 * 5. **Build.** Each survivor becomes an `OptionItem` through `optionsRender` /
 *    `optionsValue`, with per-kind defaults (see below).
 *
 * `failed` exists because an empty result and a broken read are indistinguishable
 * downstream: both leave the options empty. The picker reads the flag to say which it
 * was. What a rejection must NOT do is leave `loading` stuck on with the rejection
 * unhandled.
 */
export function useSelectionOptions(
  field: FieldHandle,
  query: string,
  /**
   * Whether the options are wanted yet. Nothing loads until they are: the combobox
   * builds its held value from the field itself, so opening a form need not read every
   * target it could offer — the picker switches this on at its first ask (a focus, a
   * click, a keystroke). Radio buttons put every option on screen, so they pass `true`.
   * Until the first load lands, `loading` stays true, which is what queues an early ask.
   */
  active: boolean,
): {
  mode: "list" | "query";
  /** The options for `query`, built (availability → search → selection merge → OptionItem). */
  options: OptionItem[];
  /** Same pipeline for any text — list mode answers a keystroke without a render. */
  optionsFor(query: string): OptionItem[];
  /** The field's value as OptionItems, in value order — the combobox's `value`. */
  selectedItems: OptionItem[];
  /**
   * The raw rows as loaded — a declared list, a thunk's result, or a lookup's target
   * rows — BEFORE the selection merge, which unconditionally folds the current value in
   * (see `optionsFor`'s pipeline comment). A caller asking "is this value one the source
   * actually offers" (radio's Other, spec: "Radio Other") must check membership here,
   * not in `options`, which always contains the current value whether or not the source
   * does.
   */
  loaded: unknown[];
  loading: boolean;
  failed: boolean;
  /**
   * Appends a row created from the picker to the loaded rows, so list mode offers it on
   * the next open without a second read. Query mode's next search replaces the rows
   * anyway, and finds it at the source.
   */
  adopt(row: unknown): void;
  /**
   * The identity the merge matches on: a lookup row's id, a Choice option's key
   * (`optionsValue`, or the value itself). Two values with equal identity are the same
   * selection.
   */
  identityOf(o: unknown): string;
} {
  const config = field.config as SelectionConfig;
  const mode = field.options?.mode ?? "list";
  const [rows, setRows] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(field.options !== undefined);
  const [failed, setFailed] = useState(false);

  // List mode keys the load on the field alone; query mode on the text as well.
  const loadKey = mode === "query" ? query : "";
  useEffect(() => {
    const source = field.options;
    if (!source) {
      setLoading(false);
      return;
    }
    if (!active) return;
    let live = true;
    setLoading(true);
    setFailed(false);
    void source.load(mode === "query" ? query : undefined).then(
      (r) => {
        if (!live) return;
        setRows(r);
        setFailed(false);
        setLoading(false);
      },
      () => {
        if (!live) return;
        // No rows, and say why: a caller that only knows "empty" would report
        // "nothing matched" for a read that never happened.
        setRows([]);
        setFailed(true);
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.name, loadKey, active]);

  // Per kind. A Choice's option is its own value: keyed and merged by `optionsValue`
  // (the value itself by default), rendered by `String`. A lookup's option is a target
  // row: `row[displayField]` is the default text — `displayField` IS the default
  // renderer, not a rival mechanism — then `Title`; the key is the row id. The merge
  // for a row stays id-based, so a custom `optionsValue` cannot break it.
  const isChoice = config.kind === "Choice";
  const keyOf = config.optionsValue ?? (isChoice ? (o: unknown) => o : idOf);
  const textOf =
    config.optionsRender ??
    (isChoice
      ? (o: unknown) => String(o)
      : (o: unknown) => {
          const row = o as Record<string, unknown>;
          return String(
            row[(config as { displayField: string }).displayField] ??
              row["Title"] ??
              "",
          );
        });
  // A Choice's identity is its key; an object key is the reference (see keyString).
  const identityOf = isChoice ? (o: unknown) => keyString(keyOf(o)) : idOf;

  const v = field.value;
  const selected: unknown[] = Array.isArray(v)
    ? v
    : v == null || v === ""
      ? []
      : [v];

  const item = (o: unknown): OptionItem => ({
    key: isChoice ? keyString(keyOf(o)) : String(keyOf(o)),
    text: textOf(o) as OptionItem["text"],
    data: o,
  });

  // The predicate sees the draft as it stands, so availability that depends on a
  // sibling field follows it: every draft change re-renders the field and re-sieves.
  const available = config.optionsFilter
    ? rows.filter((r) =>
        config.optionsFilter!({
          values: field.values,
          value: field.value,
          option: r,
          mode: field.mode,
        } satisfies OptionContext),
      )
    : rows;

  const optionsFor = (q: string): OptionItem[] => {
    const searched =
      mode === "list"
        ? config.optionsQuery
          ? [...config.optionsQuery(q, available)]
          : defaultOptionsQuery(q, available, (o) => String(textOf(o)))
        : available;
    const byIdentity = new Map(selected.map((s) => [identityOf(s), s]));
    const merged = searched.map((r) => byIdentity.get(identityOf(r)) ?? r);
    // Prepend only for the list as it opens: a search the held value does not match
    // must not answer with it (see the pipeline comment above).
    if (q !== "") return merged.map(item);
    for (const s of selected) {
      if (!merged.some((r) => identityOf(r) === identityOf(s)))
        merged.unshift(s);
    }
    return merged.map(item);
  };

  return {
    mode,
    options: optionsFor(query),
    optionsFor,
    // The merge puts each selection's own instance into the options, so building from
    // the value directly yields the same item — and one for a fill-in value or a row
    // not yet loaded, which still shows its text.
    selectedItems: selected.map(item),
    loaded: rows,
    loading,
    failed,
    adopt: (row) =>
      setRows((r) =>
        r.some((x) => identityOf(x) === identityOf(row)) ? r : [...r, row],
      ),
    identityOf,
  };
}
