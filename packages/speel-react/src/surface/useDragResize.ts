import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

export interface DragResizeOptions {
  min?: { w?: number; h?: number };
  /** Upper bound on the size. */
  max?: { w?: number; h?: number };
  initial: { w: number; h: number };
  /** The box the surface is centered in (normally the viewport). With it, a drag cannot
   *  carry the surface past an edge and a resize cannot grow it past the right or bottom
   *  edge. Without it, only `min`/`max` bound the surface. */
  bounds?: { w: number; h: number };
  /** Pixels per arrow-key press on the resize handle. Default 16. */
  step?: number;
  /** Accessible name for the resize handle. Default 'Resize'. */
  label?: string;
}

/** What the corner handle needs: a grab, a keyboard, and a name that announces both. */
export interface CornerResizeHandleProps {
  role: "button";
  tabIndex: 0;
  "aria-label": string;
  "aria-keyshortcuts": string;
  onPointerDown: (e: ReactPointerEvent) => void;
  onKeyDown: (e: ReactKeyboardEvent) => void;
}

export interface DragResizeState {
  size: { w: number; h: number };
  /** translate() for the surface main: drag offset + a resize compensation that keeps
   *  the top-left corner fixed while resizing a flex-centered box. */
  transform: string;
  dragHandleProps: { onPointerDown: (e: ReactPointerEvent) => void };
  resizeHandleProps: CornerResizeHandleProps;
}

interface Active {
  mode: "drag" | "resize";
  px: number;
  py: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
}

const clamp = (v: number, lo?: number, hi?: number): number =>
  Math.min(Math.max(v, lo ?? 0), hi ?? Number.POSITIVE_INFINITY);

/** Clamp a drag offset on one axis so the box's near edge stays at or past 0 and its
 *  far edge at or before `bound`. A box larger than the bound keeps its near edge on
 *  screen (the header, the only drag handle, stays reachable). */
const clampOffset = (
  d: number,
  size: number,
  initial: number,
  bound: number | undefined,
): number => {
  if (bound === undefined) return d;
  const home = (bound - initial) / 2; // the centered box's near edge at offset 0
  const lo = -home;
  const hi = bound - size - home;
  return Math.max(lo, Math.min(d, hi));
};

/** The largest size on one axis that keeps the far edge inside `bound`. */
const roomFor = (
  d: number,
  initial: number,
  bound: number | undefined,
): number | undefined =>
  bound === undefined ? undefined : bound - ((bound - initial) / 2 + d);

const minOf = (a?: number, b?: number): number | undefined =>
  a === undefined ? b : b === undefined ? a : Math.min(a, b);

/**
 * Drag + resize for a flex-centered modal. Resize anchors the top-left: a centered box's
 * left edge is `(vw - w)/2`, so translating by `+ (w - initialW)/2` cancels the `w` term and
 * the corner stays put; the drag offset translates the whole box. So the box's top-left is
 * `(bound - initial)/2 + offset`, which is what `bounds` clamps against.
 *
 * Pointer events rather than mouse events, so a touch or pen drags and resizes too; pointer
 * tracking is done in the capture phase (Fluent's modal swallows bubbling moves during a
 * press). The corner handle is a focusable control the arrow keys resize. The title-bar
 * drag deliberately has no keyboard equivalent: moving a centered modal is cosmetic, and
 * the keyboard user already has resize and the fullscreen toggle.
 */
export function useDragResize(opts: DragResizeOptions): DragResizeState {
  const [size, setSize] = useState(opts.initial);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const cfg = useRef(opts);
  cfg.current = opts;
  const active = useRef<Active | null>(null);

  /** A size clamped to min, max, and the room left before the bounds' far edges. */
  const fit = useCallback((w: number, h: number): { w: number; h: number } => {
    const { min, max, bounds, initial } = cfg.current;
    const d = dragRef.current;
    return {
      w: clamp(w, min?.w, minOf(max?.w, roomFor(d.x, initial.w, bounds?.w))),
      h: clamp(h, min?.h, minOf(max?.h, roomFor(d.y, initial.h, bounds?.h))),
    };
  }, []);

  const begin = useCallback((mode: "drag" | "resize", e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    active.current = {
      mode,
      px: e.clientX,
      py: e.clientY,
      w: sizeRef.current.w,
      h: sizeRef.current.h,
      dx: dragRef.current.x,
      dy: dragRef.current.y,
    };
  }, []);

  const onDragDown = useCallback(
    (e: ReactPointerEvent) => {
      // Don't start a drag from the header's buttons (fullscreen/close).
      if ((e.target as HTMLElement).closest("button")) return;
      begin("drag", e);
    },
    [begin],
  );
  const onResizeDown = useCallback(
    (e: ReactPointerEvent) => begin("resize", e),
    [begin],
  );

  const onResizeKey = useCallback(
    (e: ReactKeyboardEvent) => {
      const step = cfg.current.step ?? 16;
      const delta: Record<string, [number, number]> = {
        ArrowRight: [step, 0],
        ArrowLeft: [-step, 0],
        ArrowDown: [0, step],
        ArrowUp: [0, -step],
      };
      const d = delta[e.key];
      if (!d) return;
      e.preventDefault();
      // Keep a keyboard resize from reaching the surface (Escape still does).
      e.stopPropagation();
      const s = sizeRef.current;
      const next = fit(s.w + d[0], s.h + d[1]);
      sizeRef.current = next;
      setSize(next);
    },
    [fit],
  );

  useEffect(() => {
    const onMove = (e: { clientX: number; clientY: number }): void => {
      const a = active.current;
      if (!a) return;
      const ddx = e.clientX - a.px,
        ddy = e.clientY - a.py;
      if (a.mode === "resize") {
        setSize(fit(a.w + ddx, a.h + ddy));
      } else {
        const { bounds, initial } = cfg.current;
        const s = sizeRef.current;
        setDrag({
          x: clampOffset(a.dx + ddx, s.w, initial.w, bounds?.w),
          y: clampOffset(a.dy + ddy, s.h, initial.h, bounds?.h),
        });
      }
    };
    const onUp = (): void => {
      active.current = null;
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  }, [fit]);

  const transform = `translate(${drag.x + (size.w - opts.initial.w) / 2}px, ${drag.y + (size.h - opts.initial.h) / 2}px)`;
  return {
    size,
    transform,
    dragHandleProps: { onPointerDown: onDragDown },
    resizeHandleProps: {
      role: "button",
      tabIndex: 0,
      "aria-label": opts.label ?? "Resize",
      "aria-keyshortcuts": "ArrowUp ArrowDown ArrowLeft ArrowRight",
      onPointerDown: onResizeDown,
      onKeyDown: onResizeKey,
    },
  };
}
