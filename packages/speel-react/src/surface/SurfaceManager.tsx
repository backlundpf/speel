import {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { IEntity, FormMode, SpeelDocument } from "@speel/core";
import { SpeelModal } from "./SpeelModal.js";
import { SpeelPanel } from "./SpeelPanel.js";
import type {
  ModalChromeProps,
  PanelChromeProps,
  SurfaceFormVariantProps,
} from "./surfaceProps.js";

export type SurfaceKind = "modal" | "panel";

/**
 * What `showForm` takes: the surface's own chrome, plus the form variant's inputs.
 * `open`/`onOpenChange` are the manager's to own, and the returned promise replaces
 * `onSaved`/`onError`/`closeOnSave`, so both are dropped from the composition.
 */
export type FormRequest<T extends IEntity = IEntity> = {
  /** 'modal' (centered) or 'panel' (side drawer). Default 'panel'. */
  surface?: SurfaceKind;
} & Omit<PanelChromeProps & ModalChromeProps, "open" | "onOpenChange"> &
  Pick<
    SurfaceFormVariantProps<T>,
    | "entity"
    | "mode"
    | "sections"
    | "fields"
    | "exclude"
    | "beforeSubmit"
    | "onSubmit"
  >;

export interface DocumentFormRequest<
  T extends SpeelDocument = SpeelDocument,
> extends FormRequest<T> {
  /** Native accept filter for the file input. */
  accept?: string;
}

export interface SurfaceResult<T extends IEntity = IEntity> {
  action: "submit" | "cancel";
  entity: T;
}
export interface SurfaceApi {
  showForm<T extends IEntity>(opts: FormRequest<T>): Promise<SurfaceResult<T>>;
  showDocumentForm<T extends SpeelDocument>(
    opts: DocumentFormRequest<T>,
  ): Promise<SurfaceResult<T>>;
}

interface LiveRequest {
  id: string;
  kind: SurfaceKind;
  variant: "entity" | "document";
  opts: FormRequest;
  resolve: (r: SurfaceResult) => void;
}

export const SurfaceCtx = createContext<SurfaceApi | null>(null);

let counter = 0;

/** Owns the imperative surface stack. Mounted inside SpeelProvider; renders each open request
 *  as a SpeelModal/SpeelPanel and resolves its promise when the surface closes. */
export function SurfaceManager({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [requests, setRequests] = useState<LiveRequest[]>([]);
  const savedEntities = useRef(new Map<string, IEntity>());

  const settle = useCallback((id: string) => {
    setRequests((rs) => {
      const req = rs.find((r) => r.id === id);
      if (!req) return rs; // already settled — idempotent
      const saved = savedEntities.current.get(id);
      savedEntities.current.delete(id);
      req.resolve({
        action: saved ? "submit" : "cancel",
        entity: saved ?? req.opts.entity,
      });
      return rs.filter((r) => r.id !== id);
    });
  }, []);

  const open = useCallback(
    <T extends IEntity>(
      opts: FormRequest<T>,
      variant: "entity" | "document",
    ): Promise<SurfaceResult<T>> => {
      const id = `surface-${++counter}`;
      const kind: SurfaceKind = opts.surface ?? "panel";
      return new Promise<SurfaceResult<T>>((resolve) => {
        setRequests((rs) => [
          ...rs,
          {
            id,
            kind,
            variant,
            opts: opts as FormRequest,
            resolve: resolve as (r: SurfaceResult) => void,
          },
        ]);
      });
    },
    [],
  );
  const showForm = useCallback(
    <T extends IEntity>(opts: FormRequest<T>) => open(opts, "entity"),
    [open],
  );
  const showDocumentForm = useCallback(
    <T extends SpeelDocument>(opts: DocumentFormRequest<T>) =>
      open(opts, "document"),
    [open],
  );

  const api = useMemo<SurfaceApi>(
    () => ({ showForm, showDocumentForm }),
    [showForm, showDocumentForm],
  );

  return (
    <SurfaceCtx.Provider value={api}>
      {children}
      {requests.map((r) => {
        const o = r.opts;
        const common = {
          open: true,
          onOpenChange: (open: boolean) => {
            if (!open) settle(r.id);
          },
          onSaved: (e: IEntity) => {
            savedEntities.current.set(r.id, e);
          },
          entity: o.entity,
          ...(o.mode ? { mode: o.mode } : {}),
          ...(o.title !== undefined ? { title: o.title } : {}),
          ...(o.sections ? { sections: o.sections } : {}),
          ...(o.fields ? { fields: o.fields } : {}),
          ...(o.exclude ? { exclude: o.exclude } : {}),
          ...(o.beforeSubmit ? { beforeSubmit: o.beforeSubmit } : {}),
          ...(o.onSubmit ? { onSubmit: o.onSubmit } : {}),
          ...(r.variant === "document" ? { variant: "document" as const } : {}),
          ...((o as DocumentFormRequest).accept !== undefined
            ? { accept: (o as DocumentFormRequest).accept }
            : {}),
          ...(o.blocking !== undefined ? { blocking: o.blocking } : {}),
          ...(o.size ? { size: o.size } : {}),
          ...(o.resizable !== undefined ? { resizable: o.resizable } : {}),
          ...(o.draggable !== undefined ? { draggable: o.draggable } : {}),
          ...(o.fullscreenToggle !== undefined
            ? { fullscreenToggle: o.fullscreenToggle }
            : {}),
          ...(o.defaultFullscreen !== undefined
            ? { defaultFullscreen: o.defaultFullscreen }
            : {}),
        };
        return r.kind === "modal" ? (
          <SpeelModal key={r.id} {...common} />
        ) : (
          <SpeelPanel
            key={r.id}
            {...common}
            {...(o.position ? { position: o.position } : {})}
          />
        );
      })}
    </SurfaceCtx.Provider>
  );
}
