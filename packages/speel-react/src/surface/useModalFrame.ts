import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  MutableRefObject,
} from "react";
import type { ModalStyle } from "../adapter/SpeelUIAdapter.js";
import type { CornerResizeHandleProps } from "./useDragResize.js";
import {
  DIALOG_MIN,
  cssLengthPx,
  modalFrameCss,
  type FrameBox,
  type ModalFrameCss,
} from "./modalGeometry.js";

export interface ModalFrameOptions {
  size?: "small" | "medium" | "large";
  style?: ModalStyle;
  fullscreen: boolean;
  /** Pixels per arrow-key press on the resize handle. Default 16. */
  step?: number;
  /** Accessible name for the resize handle. Default 'Resize'. */
  label?: string;
}

export interface ModalFrameState {
  /** Attach to the element whose rect is the frame: measured once, when the user takes over.
   *  Mutable, so a skin whose frame component cannot take a ref can set it from a child. */
  frameRef: MutableRefObject<HTMLDivElement | null>;
  /** The frame's CSS; apply all of it to an absolutely (or fixed) positioned frame. */
  css: ModalFrameCss;
  dragHandleProps: { onPointerDown: (e: ReactPointerEvent) => void };
  resizeHandleProps: CornerResizeHandleProps;
}

interface Active {
  mode: "drag" | "resize";
  px: number;
  py: number;
  base: FrameBox;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The px caps: the caller's max (yielding to the screen), else the maximized size. */
function caps(style: ModalStyle | undefined): { w: number; h: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const capOf = (c: string | undefined, max: string, axis: "w" | "h") =>
    c === undefined ? undefined : cssLengthPx(`min(${c}, ${max})`, axis);
  return {
    w: capOf(style?.maxWidth, "96vw", "w") ?? Math.floor(w * 0.96),
    h: capOf(style?.maxHeight, "92vh", "h") ?? Math.floor(h * 0.92),
  };
}

/** A box within the caps and wholly on screen (the near edge wins on a too-small screen). */
function onScreen(b: FrameBox, style: ModalStyle | undefined): FrameBox {
  const c = caps(style);
  const w = Math.min(b.w, c.w);
  const h = Math.min(b.h, c.h);
  return {
    w,
    h,
    x: clamp(b.x, 0, window.innerWidth - w),
    y: clamp(b.y, 0, window.innerHeight - h),
  };
}

/**
 * Size, placement, drag and resize for a modal frame. Until the user drags or resizes, the
 * frame is pure CSS ({@link modalFrameCss}): presets, `style` lengths, `height: "auto"`,
 * centring and placement all follow content and window with nothing measured. The first
 * drag (an actual move) or resize measures the frame once and from then on the hook owns a
 * pixel box — auto height ends there, for the modal's lifetime. The box stays on screen and
 * within the caps, also when the window resizes. Resize keeps the top-left corner and stops
 * at the floor (`DIALOG_MIN`, or the frame's own size if it was smaller when taken over).
 *
 * Pointer events, tracked in the capture phase (Fluent's modal swallows bubbling moves
 * during a press); the corner handle is a focusable control the arrow keys resize. The
 * title-bar drag has no keyboard equivalent, as in {@link useDragResize}.
 */
export function useModalFrame(o: ModalFrameOptions): ModalFrameState {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<FrameBox | null>(null);
  const boxRef = useRef(box);
  boxRef.current = box;
  const cfg = useRef(o);
  cfg.current = o;
  const floor = useRef<{ w: number; h: number } | null>(null);
  const active = useRef<Active | null>(null);

  /** The current box, measuring the frame the first time; records the resize floor. */
  const grab = useCallback((): FrameBox | null => {
    let base = boxRef.current;
    if (!base) {
      const el = frameRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      base = { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    floor.current ??= {
      w: Math.min(DIALOG_MIN.w, base.w),
      h: Math.min(DIALOG_MIN.h, base.h),
    };
    return base;
  }, []);

  /** A resized box: the top-left holds; the size stays between the floor and the caps and
   *  inside the right/bottom edges. */
  const resized = useCallback((b: FrameBox, w: number, h: number): FrameBox => {
    const c = caps(cfg.current.style);
    const f = floor.current ?? { w: 0, h: 0 };
    return {
      ...b,
      w: clamp(w, f.w, Math.min(c.w, window.innerWidth - b.x)),
      h: clamp(h, f.h, Math.min(c.h, window.innerHeight - b.y)),
    };
  }, []);

  const begin = useCallback(
    (mode: "drag" | "resize", e: ReactPointerEvent) => {
      const base = grab();
      if (!base) return;
      e.preventDefault();
      e.stopPropagation();
      active.current = { mode, px: e.clientX, py: e.clientY, base };
    },
    [grab],
  );

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
      const base = grab();
      if (!base) return;
      const next = resized(base, base.w + d[0], base.h + d[1]);
      boxRef.current = next;
      setBox(next);
    },
    [grab, resized],
  );

  useEffect(() => {
    const onMove = (e: { clientX: number; clientY: number }): void => {
      const a = active.current;
      if (!a) return;
      const dx = e.clientX - a.px;
      const dy = e.clientY - a.py;
      if (a.mode === "drag") {
        // A press without movement is a click on the title bar, not a takeover.
        if (dx === 0 && dy === 0 && !boxRef.current) return;
        setBox(
          onScreen(
            { ...a.base, x: a.base.x + dx, y: a.base.y + dy },
            cfg.current.style,
          ),
        );
      } else {
        setBox(resized(a.base, a.base.w + dx, a.base.h + dy));
      }
    };
    const onUp = (): void => {
      active.current = null;
    };
    const onWindowResize = (): void => {
      setBox((b) => (b ? onScreen(b, cfg.current.style) : b));
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("resize", onWindowResize);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      window.removeEventListener("resize", onWindowResize);
    };
  }, [resized]);

  return {
    frameRef,
    css: modalFrameCss({
      ...(o.size !== undefined ? { size: o.size } : {}),
      ...(o.style !== undefined ? { style: o.style } : {}),
      fullscreen: o.fullscreen,
      box,
    }),
    dragHandleProps: { onPointerDown: onDragDown },
    resizeHandleProps: {
      role: "button",
      tabIndex: 0,
      "aria-label": o.label ?? "Resize",
      "aria-keyshortcuts": "ArrowUp ArrowDown ArrowLeft ArrowRight",
      onPointerDown: onResizeDown,
      onKeyDown: onResizeKey,
    },
  };
}
