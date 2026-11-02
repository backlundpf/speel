import {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { IEntity, FormMode, SpeelDocument } from "@speel/core";
import { useSpeelUI } from "../context.js";
import { useStableId } from "../fluent-v8/useStableId.js";
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
    | "allowEdit"
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
/** What `confirm` takes: a yes/no question, named by its title, described by its message. */
export interface ConfirmRequest {
  title: string;
  message: ReactNode;
  /** The confirm button's text. Default 'OK'. */
  confirmText?: string;
  /** The cancel button's text. Default 'Cancel'. */
  cancelText?: string;
  /** Renders the confirm button as destructive (the skin's `danger` appearance). */
  destructive?: boolean;
}

export interface SurfaceApi {
  showForm<T extends IEntity>(opts: FormRequest<T>): Promise<SurfaceResult<T>>;
  showDocumentForm<T extends SpeelDocument>(
    opts: DocumentFormRequest<T>,
  ): Promise<SurfaceResult<T>>;
  /**
   * A content-sized yes/no dialog: `true` when the user confirms, `false` on Cancel,
   * Escape, the close button or a click outside. Opens on Cancel, so Enter alone never
   * confirms.
   */
  confirm(opts: ConfirmRequest): Promise<boolean>;
}

interface LiveConfirm {
  id: string;
  opts: ConfirmRequest;
  resolve: (confirmed: boolean) => void;
}

/** One open confirm: a small auto-height modal with no resize, drag or fullscreen chrome. */
function ConfirmSurface({
  opts,
  onSettle,
}: {
  opts: ConfirmRequest;
  onSettle: (confirmed: boolean) => void;
}): JSX.Element {
  const ui = useSpeelUI();
  const messageId = useStableId();
  const cancelRef = useRef<HTMLSpanElement>(null);
  if (!ui.Dialog)
    throw new Error(
      "confirm requires a skin with a Dialog primitive (use @speel/react/fluent-v8).",
    );
  return (
    <ui.Dialog
      open
      onOpenChange={(open) => {
        if (!open) onSettle(false);
      }}
      title={opts.title}
      size="small"
      style={{ height: "auto" }}
      resizable={false}
      draggable={false}
      fullscreenToggle={false}
      ariaDescribedBy={messageId}
      // The skin Button takes no ref; its wrapper finds it.
      initialFocus={() => cancelRef.current?.querySelector("button")}
      footer={
        <>
          <ui.Button
            text={opts.confirmText ?? "OK"}
            appearance={opts.destructive ? "danger" : "primary"}
            onClick={() => onSettle(true)}
          />
          <span ref={cancelRef}>
            <ui.Button
              text={opts.cancelText ?? "Cancel"}
              appearance="secondary"
              onClick={() => onSettle(false)}
            />
          </span>
        </>
      }
    >
      <div id={messageId}>{opts.message}</div>
    </ui.Dialog>
  );
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
  const [confirms, setConfirms] = useState<LiveConfirm[]>([]);
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

  const confirm = useCallback(
    (opts: ConfirmRequest): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        const id = `confirm-${++counter}`;
        setConfirms((cs) => [...cs, { id, opts, resolve }]);
      }),
    [],
  );
  const settleConfirm = useCallback((id: string, confirmed: boolean) => {
    setConfirms((cs) => {
      const c = cs.find((x) => x.id === id);
      if (!c) return cs; // already settled — idempotent
      c.resolve(confirmed);
      return cs.filter((x) => x.id !== id);
    });
  }, []);

  const api = useMemo<SurfaceApi>(
    () => ({ showForm, showDocumentForm, confirm }),
    [showForm, showDocumentForm, confirm],
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
          ...(o.ariaLabel !== undefined ? { ariaLabel: o.ariaLabel } : {}),
          ...(o.sections ? { sections: o.sections } : {}),
          ...(o.fields ? { fields: o.fields } : {}),
          ...(o.exclude ? { exclude: o.exclude } : {}),
          ...(o.allowEdit !== undefined ? { allowEdit: o.allowEdit } : {}),
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
          ...(o.returnFocus !== undefined
            ? { returnFocus: o.returnFocus }
            : {}),
          ...(o.style !== undefined ? { style: o.style } : {}),
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
      {confirms.map((c) => (
        <ConfirmSurface
          key={c.id}
          opts={c.opts}
          onSettle={(confirmed) => settleConfirm(c.id, confirmed)}
        />
      ))}
    </SurfaceCtx.Provider>
  );
}
