import type { DbContext, DbSet, IEntity, OptionsCreator } from "@speel/core";
import { findByDisplayField } from "@speel/core";
import type { SurfaceApi, SurfaceKind } from "../surface/SurfaceManager.js";

/**
 * A UI binding fills core's empty `OptionsCreatorHost` bag by augmenting the module
 * where it lives, so every `OptionsCreator`'s args are typed for it with no cast.
 * `SelectionFieldBody` passes the surrounding `SurfaceApi` whenever it calls a creator —
 * every creator can use it, not only `createsByForm()`.
 */
declare module "@speel/core" {
  interface OptionsCreatorHost {
    surfaces: SurfaceApi;
  }
}

/**
 * A stock creator for a target that needs more than a display value — a JobTitles list
 * with a required Category, say. Instead of inserting blind (as `createsByDisplayField()`
 * does), it opens a create form for the target and lets the user fill in the rest.
 *
 * 1. An exact display-field match wins outright, exactly as `createsByDisplayField()`
 *    checks it: no form opens.
 * 2. Otherwise a fresh row is built: `initial` seeds it, then the typed text overwrites
 *    the display field — the typed text always wins over `initial`.
 * 3. The form's `onSubmit` saves the row through a fresh `db.createScope()`, so the
 *    field's own pending changes are untouched, the same one-row guarantee
 *    `createsByDisplayField()` gives.
 * 4. On submit the saved row is returned; on cancel the promise resolves `undefined` —
 *    a decline, not a failure — so the field keeps its value and the Add row returns to
 *    idle. A save error stays inside the create form's own error chrome; the combobox
 *    never sees a `failed` state from this creator.
 */
export function createsByForm<
  TSource = unknown,
  TTarget extends IEntity = IEntity,
>(opts?: {
  /**
   * 'modal' (default) or 'panel'. The originating form is usually a panel, and a panel
   * over a panel reads as a replacement rather than a detour.
   */
  surface?: SurfaceKind;
  /** Which fields the form shows. Default: every editable field. */
  fields?: string[];
  /** Seeds the new row before the typed text overwrites the display field. */
  initial?: (ctx: { text: string; source: TSource }) => Partial<TTarget>;
  /**
   * The form's title. Default: `New <list title>` when the target is a list addressed
   * by title, else `New <class name>` — which a production bundle may have minified.
   */
  title?: string;
}): OptionsCreator<TSource, TTarget> {
  const surface = opts?.surface ?? "modal";
  return async ({ text, set, db, source, displayField, surfaces }) => {
    const existing = await findByDisplayField(set, displayField, text);
    if (existing) return existing;

    const entity = new set.ctor();
    const seed = opts?.initial?.({ text, source });
    if (seed) Object.assign(entity, seed);
    (entity as unknown as Record<string, unknown>)[displayField] = text;

    const result = await surfaces.showForm<TTarget>({
      entity,
      mode: "create",
      surface,
      title: opts?.title ?? defaultTitle(db, set.ctor),
      ...(opts?.fields ? { fields: opts.fields } : {}),
      onSubmit: async (_entity, ctx) => {
        // A fresh scope per submit (retries re-scope too): the parent's own pending
        // changes are never part of this save.
        const scope = db.createScope();
        scope.set(set.ctor).add(entity, ctx.addOptions);
        await scope.saveChangesAsync({ signal: ctx.signal });
      },
    });

    return result.action === "submit" ? result.entity : undefined;
  };
}

/**
 * `New <list title>` for a title-addressed list — the name the user already knows it
 * by, and one a minifier cannot mangle — else `New <class name>`.
 */
function defaultTitle<T extends IEntity>(
  db: DbContext,
  ctor: DbSet<T>["ctor"],
): string {
  const src = db.model.findEntityType(ctor)?.source;
  if (src?.kind === "list" && src.list.kind === "title")
    return `New ${src.list.value}`;
  return `New ${ctor.name}`;
}
