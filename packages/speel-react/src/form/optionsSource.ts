import type {
  ChoiceOptionsLoader,
  DbContext,
  DbSet,
  FieldConfig,
  IEntity,
  OptionsLoader,
  OptionsThunk,
} from "@speel/core";
import type { OptionsSource } from "./FieldHandle.js";

/** A declared `options`: a literal list, or a thunk taking only `{ db }`. */
type DeclaredOptions = readonly unknown[] | OptionsThunk;

/**
 * The context a declared source runs against. Only a literal list runs without one;
 * a thunk or a query that reaches here with no `db` is a field built outside any
 * `<SpeelProvider>` — say so, rather than offer an empty list that looks like "no
 * options".
 */
function requireDb(db: DbContext | undefined): DbContext {
  if (!db)
    throw new Error(
      "This selection field's options are a thunk or a query, which needs a DbContext: " +
        "render it inside a <SpeelProvider>, or declare a literal options list.",
    );
  return db;
}

function listSource(
  declared: DeclaredOptions,
  db: DbContext | undefined,
): OptionsSource {
  if (typeof declared !== "function")
    return { mode: "list", load: () => Promise.resolve([...declared]) };
  const ctx = requireDb(db);
  return { mode: "list", load: async () => [...(await declared({ db: ctx }))] };
}

/**
 * Where a selection field's options come from — one of three states on one axis:
 * a declared server query (asked per term), a declared list or thunk (loaded once
 * and searched client-side), or, for a lookup, neither: the target's rows loaded
 * once.
 *
 * The third is what made unifying the controls safe: every lookup that declared
 * nothing still issues the one uncapped read it always did. Had the default been
 * "query per term", every forty-row lookup would have become a query per
 * keystroke.
 */
export function optionsSourceFor(args: {
  config: FieldConfig;
  /**
   * The data context. Optional only for a standalone field outside a provider: a
   * literal list needs none; anything else throws a clear error when it is missing.
   */
  db?: DbContext;
  /** The navigation's target set, for a lookup; undefined for a Choice. */
  set?: DbSet<IEntity>;
  /** The live draft values — `source` for a query loader. */
  values: Record<string, unknown>;
}): OptionsSource | undefined {
  const { config, db, set, values } = args;

  if (config.kind === "Lookup") {
    if (config.optionsQueryAsync) {
      // The loader is handed the target's set. `useField` always resolves it for a
      // navigation; a caller with no set (a standalone lookup) gets no source — the
      // same answer as the no-set branch below, rather than a loader called with
      // `set: undefined` that fails on first keystroke.
      if (!set) return undefined;
      const loader: OptionsLoader = config.optionsQueryAsync;
      const displayField = config.displayField;
      const ctx = requireDb(db);
      return {
        mode: "query",
        load: (query = "") =>
          loader({
            query,
            db: ctx,
            source: values,
            set,
            displayField,
          }) as Promise<unknown[]>,
      };
    }
    if (config.options !== undefined) return listSource(config.options, db);
    if (set) {
      // A list offers what it loaded, so it loads the lot — the same single
      // uncapped read a lookup declaring neither has always issued.
      return { mode: "list", load: () => set.toArrayAsync() };
    }
    return undefined;
  }

  if (config.kind === "Choice") {
    if (config.optionsQueryAsync) {
      const loader: ChoiceOptionsLoader = config.optionsQueryAsync;
      const ctx = requireDb(db);
      return {
        mode: "query",
        load: async (query = "") => [
          ...(await loader({ query, db: ctx, source: values })),
        ],
      };
    }
    if (config.options !== undefined) return listSource(config.options, db);
    return undefined;
  }

  return undefined;
}
