import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useForm, useStore, type AnyFormApi } from "@tanstack/react-form";
import type {
  IEntity,
  EntityType,
  EntityCtor,
  FormMode,
  IAddOptions,
  DbContext,
} from "@speel/core";
import { SaveAbortedException } from "@speel/core";
import { useSpeelContext } from "../context.js";
import {
  projectEntityToValues,
  applyValuesToEntity,
  consumeFolderValue,
} from "./projection.js";
import { buildFormErrors } from "./validators.js";

/**
 * Replace bare stubs — untracked targets carrying nothing but an Id — in a
 * navigation value with the tracked row for that id, loading it if needed.
 * Anything else (a tracked row, a target with its own data) is left alone, and
 * a stub whose row cannot be found stays as it is. Answers the same value when
 * nothing changed.
 */
async function hydrateStubs(
  ctx: DbContext,
  ctor: EntityCtor,
  value: unknown,
): Promise<unknown> {
  const one = async (t: unknown): Promise<unknown> => {
    if (t === null || typeof t !== "object") return t;
    const id = (t as { Id?: number }).Id;
    if (id == null || id === 0) return t;
    const bare = Object.entries(t).every(([k, v]) => k === "Id" || v == null);
    if (!bare || ctx.changeTracker.findEntry(ctor, id)?.entity === t) return t;
    try {
      return (await ctx.set(ctor).findAsync(id)) ?? t;
    } catch {
      return t;
    }
  };
  if (Array.isArray(value)) {
    const next = await Promise.all(value.map(one));
    return next.every((x, i) => x === value[i]) ? value : next;
  }
  return one(value);
}

export interface EntityFormOptions {
  onSaved?: (entity: IEntity) => void;
  onError?: (err: unknown) => void;
  /** The save was aborted (Cancel during submit): neutral outcome, not an error. */
  onAborted?: () => void;
  /** Runs after validation, before add/apply/save. Throw to abort and keep the form open. */
  beforeSubmit?: () => void | Promise<void>;
  /**
   * Create mode only: extra options for DbSet.add (e.g. the file to upload).
   * NOTE: the result is STAGED on the tracked entry at the first submit and
   * reused on retries — never put per-submit state (like an AbortSignal) in it.
   * The save-level signal is forwarded to uploads automatically.
   */
  getAddOptions?: () => IAddOptions | undefined;
  /**
   * Replace the default persistence (create-mode add + saveChangesAsync). Runs
   * AFTER validation, beforeSubmit, the FileDirRef folder consume, and applying
   * the draft values onto the entity — the form does NOT track or save the
   * entity itself. ctx.addOptions is what the default path would have used
   * (file from getAddOptions, folder from the FileDirRef convention), so an
   * override can call set(...).add(entity, ctx.addOptions) itself if it wants
   * context tracking. Outcomes route as usual (onSaved / SaveAborted notice /
   * submitError).
   */
  onSubmit?:
    | ((
        entity: IEntity,
        ctx: { mode: FormMode; signal: AbortSignal; addOptions: IAddOptions },
      ) => void | Promise<void>)
    | undefined;
}

export interface EntityForm<T extends IEntity = IEntity> {
  readonly form: AnyFormApi;
  readonly et: EntityType;
  readonly entity: T;
  readonly mode: FormMode;
  /** UI-only touched state, managed here (decoupled from field registration). */
  readonly touched: Record<string, boolean>;
  /**
   * Is the draft currently valid and idle? The default footer no longer gates Save on
   * this (an invalid click reveals the errors instead); a custom footer that prefers a
   * disabled Save reads it from here.
   */
  readonly canSubmit: boolean;
  readonly submitError: string | undefined;
  /** Neutral outcome notice (e.g. 'Save canceled.'), cleared on the next submit. */
  readonly submitNotice: string | undefined;
  markTouched(name: string): void;
  markAllTouched(): void;
  submit(): Promise<void>;
  /** Abort the in-flight save (no-op when not submitting). */
  abort(): void;
  reset(): void;
}

const FormCtx = createContext<EntityForm | null>(null);

export function EntityFormProvider({
  value,
  children,
}: {
  value: EntityForm;
  children: ReactNode;
}): JSX.Element {
  return <FormCtx.Provider value={value}>{children}</FormCtx.Provider>;
}

export function useEntityFormContext(): EntityForm {
  const f = useContext(FormCtx);
  if (!f)
    throw new Error(
      "useField must be used within an <EntityFormProvider> (created by useEntityForm).",
    );
  return f;
}

/**
 * Wraps @tanstack/react-form for a @speel/core entity (draft model). On submit it
 * applies the draft onto the tracked entity and saves; in create mode it first adds
 * the entity to its DbSet. Save failures are captured as `submitError`.
 */
export function useEntityForm<T extends IEntity>(
  entity: T,
  mode: FormMode = "edit",
  options?: EntityFormOptions,
): EntityForm<T> {
  const ctx = useSpeelContext();
  const et = ctx.model.findEntityType(entity.constructor as never);
  if (!et)
    throw new Error(
      `useEntityForm: ${entity.constructor.name} is not a registered entity.`,
    );

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [submitNotice, setSubmitNotice] = useState<string | undefined>(
    undefined,
  );
  const abortRef = useRef<AbortController | null>(null);

  const markTouched = useCallback((name: string) => {
    setTouched((t) => (t[name] ? t : { ...t, [name]: true }));
  }, []);
  const markAllTouched = useCallback(() => {
    const all: Record<string, boolean> = {};
    for (const p of et.properties) all[p.propertyName] = true;
    for (const n of et.navigations()) all[n.name] = true;
    setTouched(all);
  }, [et]);

  const form = useForm({
    defaultValues: projectEntityToValues(et, entity),
    validators: {
      onChange: ({ value }: { value: Record<string, unknown> }) =>
        toGlobalError(buildFormErrors(et, value, mode)),
      onSubmit: ({ value }: { value: Record<string, unknown> }) =>
        toGlobalError(buildFormErrors(et, value, mode)),
    },
    onSubmit: async ({ value }: { value: Record<string, unknown> }) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setSubmitError(undefined);
      setSubmitNotice(undefined);
      try {
        await options?.beforeSubmit?.();
        // FileDirRef folder convention: a surfaced FileDirRef field's value is a
        // list-relative folder placement (an add option), never a column write.
        const { values, folder } = consumeFolderValue(et, value);
        const composeAddOptions = (): IAddOptions => {
          const o: IAddOptions = { ...(options?.getAddOptions?.() ?? {}) };
          if (folder !== undefined) o.folder = folder;
          return o;
        };
        if (options?.onSubmit) {
          // Caller-owned persistence: the entity is fully applied first so the
          // override receives its final shape.
          applyValuesToEntity(et, entity, values);
          await options.onSubmit(entity, {
            mode,
            signal: controller.signal,
            addOptions: composeAddOptions(),
          });
        } else {
          const id = (entity as { Id?: number }).Id;
          if (
            mode === "create" &&
            (id === undefined || id === null || id === 0)
          ) {
            // add() validates options before tracking (a bad folder/file throws
            // without tracking) and is idempotent for an already-tracked Added
            // instance: each retry RE-STAGES the current options, so a file or
            // folder changed after an aborted/failed attempt is what uploads.
            ctx
              .set(entity.constructor as EntityCtor<T>)
              .add(entity, composeAddOptions());
          }
          applyValuesToEntity(et, entity, values);
          await ctx.saveChangesAsync({ signal: controller.signal });
        }
        options?.onSaved?.(entity);
      } catch (e) {
        if (e instanceof SaveAbortedException) {
          // A user cancellation, not a failure: neutral notice, draft intact.
          setSubmitNotice("Save canceled.");
          options?.onAborted?.();
        } else {
          setSubmitError(e instanceof Error ? e.message : String(e));
          options?.onError?.(e);
        }
      } finally {
        abortRef.current = null;
      }
    },
  });

  // Load every navigation the form doesn't already have, so view/edit forms can display and
  // traverse all of them. Loading goes through the entry handles, so the same mechanics serve
  // application code calling ctx.entry(x).collection(...).loadAsync() directly.
  useEffect(() => {
    let live = true;
    void (async () => {
      const entry = ctx.entry(entity);
      for (const nav of et.navigations()) {
        // Form-level skip: the user already chose a value in this session. Distinct from the
        // entry's isLoaded, which answers whether stored data was fetched.
        const current = form.store.state.values[nav.name];
        if (current != null) {
          // A bare stub (from deserialize(), say) has nothing to display: swap it
          // for the tracked row by id. Membership is the draft's and is kept —
          // reloading the navigation would replace it with server state.
          const hydrated = await hydrateStubs(ctx, nav.target.ctor, current);
          if (!live) return;
          if (hydrated !== current)
            form.setFieldValue(nav.name, hydrated as never);
          continue;
        }
        const handle =
          nav.kind === "collection"
            ? entry.collection(nav.name)
            : entry.reference(nav.name);
        await handle.loadAsync();
        // NOTE: `live` guards the form-store write and nothing else. loadAsync() has
        // already assigned the loaded value onto the entity and rewritten that nav's
        // change-tracking baseline by the time we get here, so unmounting mid-load does
        // NOT undo those — the entity and its entry are context-scoped and outlive this
        // component. All this early return prevents is a setState on an unmounted form.
        if (!live) return;
        form.setFieldValue(nav.name, handle.currentValue as never);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [et]);

  const canSubmit = useStore(form.store, (s) => s.canSubmit as boolean);

  const submit = useCallback(async () => {
    markAllTouched();
    await form.handleSubmit();
  }, [form, markAllTouched]);
  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);
  const reset = useCallback(() => {
    form.reset();
    setTouched({});
    setSubmitError(undefined);
    setSubmitNotice(undefined);
  }, [form]);

  return useMemo<EntityForm<T>>(
    () => ({
      form,
      et,
      entity,
      mode,
      touched,
      canSubmit,
      submitError,
      submitNotice,
      markTouched,
      markAllTouched,
      submit,
      abort,
      reset,
    }),
    [
      form,
      et,
      entity,
      mode,
      touched,
      canSubmit,
      submitError,
      submitNotice,
      markTouched,
      markAllTouched,
      submit,
      abort,
      reset,
    ],
  );
}

/**
 * Shape core's { fields, form } as TanStack's GlobalFormValidationError — but return
 * `undefined` when there are no actual errors. TanStack treats any returned object as a
 * validation failure (blocking submit), so an all-`undefined` map must collapse to nothing.
 */
function toGlobalError(errs: {
  fields: Record<string, string | undefined>;
  form: string | undefined;
}) {
  const hasError =
    errs.form !== undefined ||
    Object.values(errs.fields).some((v) => v !== undefined);
  return hasError ? { form: errs.form, fields: errs.fields } : undefined;
}
