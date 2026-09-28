import type { DbContext, DbSet, FieldConfig, IEntity } from "@speel/core";
import type { SurfaceApi } from "../surface/SurfaceManager.js";

/**
 * How a selection field creates a value the user typed, or `undefined` when it cannot:
 *
 * - a lookup declaring `optionsCreateAsync`, with its target set in hand, calls the
 *   creator with `{ text, set, db, source, displayField, surfaces }`;
 * - a fill-in Choice has nothing to persist: the text IS the value;
 * - anything else cannot create.
 *
 * Built next to `optionsSourceFor`, so the field body never assembles the creator's
 * arguments itself.
 */
export function createFor(args: {
  config: FieldConfig;
  db: DbContext | undefined;
  /** The navigation's target set, for a lookup. */
  set?: DbSet<IEntity>;
  /** The live draft values — the creator's `source`. */
  values: Record<string, unknown>;
  /**
   * The surrounding `SurfaceApi` (null outside a provider). A lookup's creator also
   * needs `set` and `db`, and `SpeelProvider` — which supplies those — always mounts
   * the surface manager alongside them, so the two are never present one without the
   * other in practice; the null check below is defensive, not expected to trigger.
   */
  surfaces: SurfaceApi | null;
}): ((text: string) => Promise<unknown | undefined>) | undefined {
  const { config, db, set, values, surfaces } = args;

  if (config.kind === "Lookup") {
    const creator = config.optionsCreateAsync;
    if (!creator || !set || !db || !surfaces) return undefined;
    const displayField = config.displayField;
    return (text) =>
      creator({ text, set, db, source: values, displayField, surfaces });
  }

  if (config.kind === "Choice" && config.fillIn) return async (text) => text;

  return undefined;
}
