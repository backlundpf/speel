import type { DbContext } from "../DbContext.js";
import type { DbSet } from "../DbSet.js";
import type { IEntity } from "../types.js";
import type { FilterNode } from "../Query/FilterNode.js";

/** What every server-side options query receives. */
export type OptionsQueryArgs<TSource = unknown> = {
  /** What the user has typed. "" when the picker opens cold. */
  query: string;
  /** For anything the field's own set cannot answer. */
  db: DbContext;
  /** The entity being edited — live draft values, not the persisted row. */
  source: TSource;
};

/**
 * A lookup's server-side options query, run per search term. Declaring one replaces
 * the default load entirely, so a consumer can filter, cap, expand, reorder, or read a
 * different set altogether. The framework applies no `take` — a loader owns its limits —
 * and cannot see what it did, so a loader that ignores `query` reloads the whole list.
 */
export type OptionsLoader<
  TSource = unknown,
  TTarget extends IEntity = IEntity,
> = (
  args: OptionsQueryArgs<TSource> & {
    /** The target's set, ready to query. */
    set: DbSet<TTarget>;
    /** The target property the lookup displays — what a default search matches on. */
    displayField: string;
  },
) => Promise<TTarget[]>;

/** A Choice's server-side options query. A Choice has no target, so there is no `set`. */
export type ChoiceOptionsLoader<TSource = unknown, T = unknown> = (
  args: OptionsQueryArgs<TSource>,
) => Promise<readonly T[]>;

/**
 * A lazily-sourced option list, evaluated once per field instance. It receives the
 * context and nothing else: a thunk is cached, so a cascade written against `source`
 * here would evaluate once and never again. Cascades belong on `optionsQueryAsync`.
 */
export type OptionsThunk<T = unknown> = (ctx: {
  db: DbContext;
}) => readonly T[] | Promise<readonly T[]>;

/**
 * How many rows a default SEARCH read brings back. A search is a question the user can
 * ask again with more text, so a bounded answer costs nothing. It applies to the query
 * path ONLY: a list loaded once has no second question, and capping it would make row
 * 101 unpickable.
 */
export const OPTIONS_QUERY_TAKE = 100;

/**
 * The stock server-side search: `contains` on the lookup's display column, capped.
 * Narrows at the SOURCE — never fetches the list and sieves it — and never opens a cold
 * picker on an unbounded read.
 */
export function searchesDisplayField<
  TSource = unknown,
  TTarget extends IEntity = IEntity,
>(opts: { take?: number } = {}): OptionsLoader<TSource, TTarget> {
  const take = opts.take ?? OPTIONS_QUERY_TAKE;
  return ({ query, set, displayField }) => {
    const base =
      query !== ""
        ? set.where((b) =>
            (
              b as unknown as Record<
                string,
                { contains(v: string): FilterNode }
              >
            )[displayField]!.contains(query),
          )
        : set;
    return base.take(take).toArrayAsync();
  };
}

/**
 * What a UI binding hands every creator, beyond core's own arguments. Empty in core; a
 * binding fills it by module augmentation (`@speel/react` adds `surfaces`), so a creator
 * written against that binding is fully typed and core knows nothing about UI.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OptionsCreatorHost {}

/**
 * Creates the target row for `text` and returns it, saved: it must carry its id.
 * Resolving `undefined` means the user declined (a Cancel): the field keeps its value and
 * the Add row returns to idle, which is not a failure.
 */
export type OptionsCreator<
  TSource = unknown,
  TTarget extends IEntity = IEntity,
> = (
  args: {
    /** What the user typed, trimmed. Never empty. */
    text: string;
    /** The target's set, ready to query or add to. */
    set: DbSet<TTarget>;
    db: DbContext;
    /** The entity being edited — live draft values, not the persisted row. */
    source: TSource;
    /** The target property the lookup displays. */
    displayField: string;
  } & OptionsCreatorHost,
) => Promise<TTarget | undefined>;

/**
 * The exact-match lookup `createsByDisplayField()` and `@speel/react`'s `createsByForm()`
 * both start with: does a row already carry this exact display value? Exported so a
 * custom creator can reuse it instead of duplicating the query.
 */
export async function findByDisplayField<T extends IEntity>(
  set: DbSet<T>,
  displayField: string,
  text: string,
): Promise<T | undefined> {
  const rows = await set
    .where((b) =>
      (b as unknown as Record<string, { eq(v: string): FilterNode }>)[
        displayField
      ]!.eq(text),
    )
    .take(1)
    .toArrayAsync();
  return rows[0];
}

/**
 * The stock lookup creator: an exact display-field match wins outright, so a capped
 * picker list or a beat-you-to-it insert never duplicates a row. Otherwise it inserts a
 * new row with `text` in the display field, through a fresh `db.createScope()` so the
 * parent's own pending changes are untouched. On an insert failure it re-runs the
 * exact-match query once — another user may have just won the same race — and rethrows
 * only if the row still does not exist.
 */
export function createsByDisplayField<
  TSource = unknown,
  TTarget extends IEntity = IEntity,
>(): OptionsCreator<TSource, TTarget> {
  return async ({ text, set, db, displayField }) => {
    const existing = await findByDisplayField(set, displayField, text);
    if (existing) return existing;

    const scope = db.createScope();
    const row = new set.ctor();
    (row as unknown as Record<string, unknown>)[displayField] = text;
    scope.set(set.ctor).add(row);
    try {
      await scope.saveChangesAsync();
    } catch (err) {
      const wonByAnother = await findByDisplayField(set, displayField, text);
      if (wonByAnother) return wonByAnother;
      throw err;
    }
    return row;
  };
}
