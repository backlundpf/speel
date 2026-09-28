import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

export interface DragResizeOptions {
  min?: { w?: number; h?: number };
  initial: { w: number; h: number };
}

export interface DragResizeState {
  size: { w: number; h: number };
  /** translate() for the surface main: drag offset + a resize compensation that keeps
   *  the top-left corner fixed while resizing a flex-centered box. */
  transform: string;
  dragHandleProps: { onMouseDown: (e: ReactMouseEvent) => void };
  resizeHandleProps: { onMouseDown: (e: ReactMouseEvent) => void };
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

/**
 * Drag + resize for a flex-centered modal. Resize anchors the top-left: a centered box's
 * left edge is `(vw - w)/2`, so translating by `+ (w - initialW)/2` cancels the `w` term and
 * the corner stays put; the drag offset translates the whole box. Pointer tracking is done in
 * the capture phase (Fluent's modal swallows bubbling mousemove during a press).
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

  const begin = useCallback((mode: "drag" | "resize", e: ReactMouseEvent) => {
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
    (e: ReactMouseEvent) => {
      // Don't start a drag from the header's buttons (fullscreen/close).
      if ((e.target as HTMLElement).closest("button")) return;
      begin("drag", e);
    },
    [begin],
  );
  const onResizeDown = useCallback(
    (e: ReactMouseEvent) => begin("resize", e),
    [begin],
  );

  useEffect(() => {
    const onMove = (e: globalThis.MouseEvent): void => {
      const a = active.current;
      if (!a) return;
      const ddx = e.clientX - a.px,
        ddy = e.clientY - a.py;
      if (a.mode === "resize") {
        const min = cfg.current.min;
        setSize({
          w: Math.max(min?.w ?? 0, a.w + ddx),
          h: Math.max(min?.h ?? 0, a.h + ddy),
        });
      } else {
        setDrag({ x: a.dx + ddx, y: a.dy + ddy });
      }
    };
    const onUp = (): void => {
      active.current = null;
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };
  }, []);

  const transform = `translate(${drag.x + (size.w - opts.initial.w) / 2}px, ${drag.y + (size.h - opts.initial.h) / 2}px)`;
  return {
    size,
    transform,
    dragHandleProps: { onMouseDown: onDragDown },
    resizeHandleProps: { onMouseDown: onResizeDown },
  };
}
