/** Whether writing a key adds a history entry or overwrites the current one. */
export type UrlHistoryMode = "push" | "replace";

/**
 * How one query-string key is read and written.
 *
 * `defaultValue` is not just a fallback: a value whose encoding matches the
 * default's encoding is omitted from the URL entirely, so "absent" and "default"
 * can never disagree and shared links stay short.
 */
export interface UrlCodec<T> {
  /** Query-string text → value. Returns `defaultValue` when absent or unparseable. */
  decode(raw: string | null): T;
  /** Value → query-string text. `null` removes the key. */
  encode(value: T): string | null;
  readonly defaultValue: T;
  readonly history: UrlHistoryMode;
}

export interface UrlCodecOptions<T> {
  default?: T;
  history?: UrlHistoryMode;
}

export function urlString(
  opts: UrlCodecOptions<string | null> = {},
): UrlCodec<string | null> {
  const defaultValue = opts.default ?? null;
  return {
    defaultValue,
    history: opts.history ?? "replace",
    // An empty value is the same as an absent one — `?resnum=` means nothing selected.
    decode: (raw) => (raw === null || raw === "" ? defaultValue : raw),
    encode: (value) => (value === null || value === "" ? null : value),
  };
}

export function urlBoolean(
  opts: UrlCodecOptions<boolean> = {},
): UrlCodec<boolean> {
  const defaultValue = opts.default ?? false;
  return {
    defaultValue,
    history: opts.history ?? "replace",
    // Anything that is not the literal 'true' is false — a hand-edited URL
    // degrades to a usable state rather than throwing.
    decode: (raw) => (raw === null ? defaultValue : raw === "true"),
    encode: (value) => (value ? "true" : "false"),
  };
}

export function urlNumber(
  opts: UrlCodecOptions<number | null> = {},
): UrlCodec<number | null> {
  const defaultValue = opts.default ?? null;
  return {
    defaultValue,
    history: opts.history ?? "replace",
    decode: (raw) => {
      if (raw === null || raw.trim() === "") return defaultValue;
      const parsed = Number(raw);
      // Number('abc') is NaN and Number('Infinity') is not a useful URL value —
      // both fall back rather than propagating into a consumer's arithmetic.
      return Number.isFinite(parsed) ? parsed : defaultValue;
    },
    encode: (value) => (value === null ? null : String(value)),
  };
}
