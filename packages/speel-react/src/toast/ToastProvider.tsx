import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useSpeelUI } from "../context.js";
import { useHostFontFamily } from "../overlay/useHostFont.js";
import { ABOVE_BLOCKING_ATTR, Z } from "../layers.js";

export type ToastIntent = "info" | "success" | "warning" | "error";
export type ToastPosition =
  | "top-left"
  | "top-right"
  | "top-center"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center"
  | "center";
export type ToastSize = "normal" | "wide";

export interface ToastOptions {
  intent?: ToastIntent;
  title?: string;
  message: ReactNode;
  /** auto-dismiss ms; `undefined` → provider default; `null` → sticky. */
  duration?: number | null;
  /** default true → shows the dismiss button. */
  dismissible?: boolean;
  /** where it appears; default → the provider `position`. */
  position?: ToastPosition;
  /** footprint: `'normal'` (≤360px) or `'wide'` (≤560px); default `'normal'`. */
  size?: ToastSize;
}

export interface ToastApi {
  (options: ToastOptions): string;
  success(
    message: ReactNode,
    options?: Omit<ToastOptions, "intent" | "message">,
  ): string;
  error(
    message: ReactNode,
    options?: Omit<ToastOptions, "intent" | "message">,
  ): string;
  warning(
    message: ReactNode,
    options?: Omit<ToastOptions, "intent" | "message">,
  ): string;
  info(
    message: ReactNode,
    options?: Omit<ToastOptions, "intent" | "message">,
  ): string;
  dismiss(id: string): void;
}

interface Toast {
  id: string;
  intent: ToastIntent;
  title?: string;
  message: ReactNode;
  duration: number | null;
  dismissible: boolean;
  position: ToastPosition;
  size: ToastSize;
}

export const ToastCtx = createContext<ToastApi | null>(null);

let counter = 0;

/** Owns the toast queue/timers and renders a portaled, fixed-position stack. Must be inside a SpeelProvider. */
export function ToastProvider({
  position = "top-right",
  duration = 6000,
  children,
}: {
  position?: ToastPosition;
  duration?: number;
  children: ReactNode;
}): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (opts: ToastOptions): string => {
      const id = `toast-${++counter}`;
      const t: Toast = {
        id,
        intent: opts.intent ?? "info",
        ...(opts.title !== undefined ? { title: opts.title } : {}),
        message: opts.message,
        duration: opts.duration === undefined ? duration : opts.duration,
        dismissible: opts.dismissible ?? true,
        position: opts.position ?? position,
        size: opts.size ?? "normal",
      };
      setToasts((ts) => [t, ...ts]);
      if (typeof t.duration === "number" && t.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), t.duration),
        );
      }
      return id;
    },
    [duration, position, dismiss],
  );

  const api = useMemo<ToastApi>(() => {
    const fn = ((opts: ToastOptions) => show(opts)) as ToastApi;
    fn.success = (message, o) => show({ ...o, intent: "success", message });
    fn.error = (message, o) => show({ ...o, intent: "error", message });
    fn.warning = (message, o) => show({ ...o, intent: "warning", message });
    fn.info = (message, o) => show({ ...o, intent: "info", message });
    fn.dismiss = dismiss;
    return fn;
  }, [show, dismiss]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  // The stack portals into document.body, which the host page may leave unstyled
  // (SharePoint does) — so it carries the font measured where the app renders.
  const { probe, fontFamily } = useHostFontFamily();
  return (
    <ToastCtx.Provider value={api}>
      {children}
      {probe}
      <ToastContainer
        toasts={toasts}
        onDismiss={dismiss}
        {...(fontFamily ? { fontFamily } : {})}
      />
    </ToastCtx.Provider>
  );
}

const POSITION: Record<ToastPosition, CSSProperties> = {
  "top-left": {
    top: 64,
    left: 16,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  "top-right": {
    top: 64,
    right: 16,
    flexDirection: "column",
    alignItems: "flex-end",
  },
  "top-center": {
    top: 64,
    left: "50%",
    transform: "translateX(-50%)",
    flexDirection: "column",
    alignItems: "center",
  },
  "bottom-left": {
    bottom: 16,
    left: 16,
    flexDirection: "column-reverse",
    alignItems: "flex-start",
  },
  "bottom-right": {
    bottom: 16,
    right: 16,
    flexDirection: "column-reverse",
    alignItems: "flex-end",
  },
  "bottom-center": {
    bottom: 16,
    left: "50%",
    transform: "translateX(-50%)",
    flexDirection: "column-reverse",
    alignItems: "center",
  },
  center: {
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    flexDirection: "column",
    alignItems: "center",
  },
};

function ToastContainer({
  toasts,
  onDismiss,
  fontFamily,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  fontFamily?: string;
}): JSX.Element | null {
  const ui = useSpeelUI();
  if (typeof document === "undefined") return null;
  const groups = new Map<ToastPosition, Toast[]>();
  for (const t of toasts)
    groups.set(t.position, [...(groups.get(t.position) ?? []), t]);
  return createPortal(
    <>
      {[...groups.entries()].map(([position, ts]) => (
        <div
          key={position}
          data-position={position}
          {...{ [ABOVE_BLOCKING_ATTR]: "" }}
          style={{
            position: "fixed",
            zIndex: Z.toasts,
            display: "flex",
            gap: 8,
            maxWidth: "calc(100vw - 32px)",
            ...(fontFamily ? { fontFamily } : {}),
            ...POSITION[position],
          }}
        >
          {ts.map((t) => (
            <div
              key={t.id}
              data-size={t.size}
              style={{
                maxWidth: t.size === "wide" ? 560 : 360,
                boxShadow: "0 2px 8px rgba(0,0,0,.2)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <ui.MessageBar
                intent={t.intent}
                {...(t.dismissible ? { onDismiss: () => onDismiss(t.id) } : {})}
              >
                {t.title ? <strong>{t.title}: </strong> : null}
                {t.message}
              </ui.MessageBar>
            </div>
          ))}
        </div>
      ))}
    </>,
    document.body,
  );
}
