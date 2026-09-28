import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

export interface ResizableOptions {
  axis?: "both" | "x" | "y";
  min?: { w?: number; h?: number };
  /** Upper bound. Without one a drag can take the surface past the viewport edge. */
  max?: { w?: number; h?: number };
  initial?: { w?: number; h?: number };
  /** When the handle sits on the edge that shrinks as the pointer moves right (panel at 'end'). */
  invertX?: boolean;
  /** Pixels per arrow-key press. Default 16. */
  step?: number;
  /** Accessible name for the handle. Default 'Resize'. */
  label?: string;
}

/** What the handle element needs: a grab, a keyboard, and the role that announces both. */
export interface ResizeHandleProps {
  role: "separator";
  tabIndex: 0;
  "aria-label": string;
  "aria-orientation": "vertical" | "horizontal";
  onPointerDown: (e: ReactPointerEvent) => void;
  onKeyDown: (e: ReactKeyboardEvent) => void;
}

export interface ResizeState {
  size: { w?: number; h?: number };
  handleProps: ResizeHandleProps;
}

const clamp = (v: number, lo?: number, hi?: number): number =>
  Math.min(Math.max(v, lo ?? 0), hi ?? Number.POSITIVE_INFINITY);

/** Tracks pointer-drag width/height from a handle. Deterministic (no DOM measurement):
 *  resizes relative to `initial` and the drag-start point, clamped to `min` and `max`.
 *
 *  Pointer events rather than mouse events, so a touch or pen drag resizes too; and the
 *  handle is a focusable `separator` the arrow keys move, so resizing is not a thing only
 *  a mouse can do. */
export function useResizable(opts: ResizableOptions = {}): ResizeState {
  const [size, setSize] = useState<{ w?: number; h?: number }>(
    opts.initial ?? {},
  );
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const cfg = useRef(opts);
  cfg.current = opts;
  const start = useRef<{ px: number; py: number; w: number; h: number } | null>(
    null,
  );

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    // Keep Fluent's draggable Modal (DraggableZone) from treating this as a drag start.
    e.stopPropagation();
    start.current = {
      px: e.clientX,
      py: e.clientY,
      w: sizeRef.current.w ?? cfg.current.initial?.w ?? 0,
      h: sizeRef.current.h ?? cfg.current.initial?.h ?? 0,
    };
  }, []);

  const onKeyDown = useCallback((e: ReactKeyboardEvent) => {
    const { axis = "both", min, max, invertX, step = 16 } = cfg.current;
    const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
    const vertical = e.key === "ArrowUp" || e.key === "ArrowDown";
    if (horizontal && axis === "y") return;
    if (vertical && axis === "x") return;
    if (!horizontal && !vertical) return;
    e.preventDefault();
    setSize((s) => {
      const next = { ...s };
      if (horizontal) {
        // The same sign rule the drag uses: with the handle on the shrinking edge,
        // moving it right makes the surface narrower.
        const dx = (e.key === "ArrowRight" ? step : -step) * (invertX ? -1 : 1);
        const base = s.w ?? cfg.current.initial?.w ?? 0;
        next.w = clamp(base + dx, min?.w, max?.w);
      } else {
        const dy = e.key === "ArrowDown" ? step : -step;
        const base = s.h ?? cfg.current.initial?.h ?? 0;
        next.h = clamp(base + dy, min?.h, max?.h);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onMove = (e: { clientX: number; clientY: number }): void => {
      const st = start.current;
      if (!st) return;
      const { axis = "both", min, max, invertX } = cfg.current;
      const dx = (e.clientX - st.px) * (invertX ? -1 : 1);
      const dy = e.clientY - st.py;
      setSize((s) => {
        const next = { ...s };
        if (axis !== "y") next.w = clamp(st.w + dx, min?.w, max?.w);
        if (axis !== "x") next.h = clamp(st.h + dy, min?.h, max?.h);
        return next;
      });
    };
    const onUp = (): void => {
      start.current = null;
    };
    // Capture phase: see the move before any surface element can stopPropagation it
    // (Fluent's modal swallows bubbling moves during a press).
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  }, []);

  return {
    size,
    handleProps: {
      role: "separator",
      tabIndex: 0,
      "aria-label": opts.label ?? "Resize",
      "aria-orientation":
        (opts.axis ?? "both") === "y" ? "horizontal" : "vertical",
      onPointerDown,
      onKeyDown,
    },
  };
}
