import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * The client width of `ref`'s element, kept current with a ResizeObserver (window `resize`
 * where there is none). 0 until measured — and always in jsdom, which has no layout.
 */
export function useContainerWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = (): void => setWidth(el.clientWidth);
    // Synchronous on mount, so the first paint is already laid out at the measured width.
    read();
    const RO = (
      window as unknown as {
        ResizeObserver?: new (cb: () => void) => {
          observe: (target: Element) => void;
          disconnect: () => void;
        };
      }
    ).ResizeObserver;
    if (!RO) {
      window.addEventListener("resize", read);
      return () => window.removeEventListener("resize", read);
    }
    // A re-render from inside the observer callback re-lays out the table, which changes the
    // observed box's height in the same frame — and the browser reports "ResizeObserver loop
    // completed with undelivered notifications". Read on the next frame instead.
    let frame = 0;
    const observer = new RO(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(read);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref]);
  return width;
}
